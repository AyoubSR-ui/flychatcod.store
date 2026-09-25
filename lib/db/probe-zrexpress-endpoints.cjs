// One-off: probe a live ZR Express (Procolis) connection for read-only
// communes/desk/fee-listing endpoints. Unlike Ecotrack, nothing in this repo
// (artifacts/api-server/src/lib/carriers/zrexpress.ts) confirms ANY such
// endpoint exists — the only two confirmed Procolis actions are `add_colis`
// (creates a parcel) and `lire` (reads back one specific parcel by tracking
// number), both POST, neither usable as a "does auth work" sanity check or a
// listing endpoint. So there is no known-good phase here like the Ecotrack
// script has — every path below is a genuine unknown, and the result pattern
// itself (all-401/403 vs. a mix of 404s) is what tells you whether token+key
// are even being accepted, not just whether a given path exists.
//
// Read-only. Only ever issues GET requests. Never calls add_colis, lire, or
// anything else that could create/mutate a real parcel or touch carrier-side
// state.
//
// Reuses the same encryption scheme as
// artifacts/api-server/src/lib/credentials-crypto.ts (decryptCredentials) —
// duplicated here in plain crypto rather than imported, since that file is
// TypeScript and this is a standalone .cjs script; kept byte-for-byte
// identical (same algo, same scrypt salt, same env vars) so it decrypts the
// exact same carrier_connections.credentials blobs.
//
// Base URL and header shape (`token` + `key`, no `Authorization` header) are
// taken from artifacts/api-server/src/lib/carriers/zrexpress.ts rather than
// re-derived, so this probes exactly what the app itself would send.
//
// Never prints the token or key, or the raw credentials payload.
//
// NOT RUN. Usage (when you choose to run it):
//   node lib/db/probe-zrexpress-endpoints.cjs
const { Pool } = require("pg");
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const ZR_CARRIER_KEY = "zr_express";
const ZR_BASE_URL = "https://procolis.com/api_v1";

// Grouped per the three data types asked about. Procolis's only two
// confirmed actions (add_colis, lire) are flat, lowercase, French,
// underscore-separated, with no version/action prefix — these candidates
// follow that same convention rather than Ecotrack's REST-ish "get/..."
// style, since that's the only naming convention this API has actually
// confirmed. Still genuinely a guess list, not a verified one.
const COMMUNE_CANDIDATES = [
  "communes",
  "get_communes",
  "liste_communes",
  "communes_list",
  "wilayas",
  "get_wilayas",
  "liste_wilayas",
];

const DESK_CANDIDATES = [
  "desks",
  "agences",
  "bureaux",
  "points_relais",
  "stop_desk",
  "stopdesk",
  "stop_desks",
  "centres",
  "agences_stopdesk",
  "bureaux_stopdesk",
  "liste_agences",
  "liste_bureaux",
];

const FEE_CANDIDATES = [
  "tarification",
  "get_tarification",
  "tarifs",
  "get_tarifs",
  "prix",
  "tarif_wilaya",
  "tarifs_wilaya",
];

function getKey() {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY || process.env.JWT_SECRET || "";
  if (!secret) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY (or JWT_SECRET as fallback) must be set to decrypt carrier credentials");
  }
  return crypto.scryptSync(secret, "flychat-carrier-credentials", 32);
}

function decryptCredentials(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted credentials payload");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function shortSample(text, max = 300) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function probe(path, token, key) {
  const url = `${ZR_BASE_URL}/${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { token, key, Accept: "application/json" },
    });
    const bodyText = await res.text();
    let sample;
    try {
      const parsed = JSON.parse(bodyText);
      sample = shortSample(JSON.stringify(parsed));
    } catch {
      sample = shortSample(bodyText);
    }
    return { path, status: res.status, ok: res.ok, sample };
  } catch (e) {
    return { path, status: null, ok: false, sample: `ERROR: ${e.message}` };
  }
}

async function probeGroup(label, paths, token, key) {
  console.log(`\n── ${label} ──`);
  const results = [];
  for (const path of paths) {
    const r = await probe(path, token, key);
    results.push(r);
    console.log(`  [${r.status ?? "ERR"}] ${r.path}\n      ${r.sample}`);
  }
  return results;
}

(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

  let row;
  try {
    const { rows } = await p.query(
      `SELECT id, store_id, carrier, label, status, credentials
       FROM carrier_connections
       WHERE carrier ILIKE $1 OR carrier ILIKE '%zr%' OR label ILIKE '%zr%'
       ORDER BY created_at DESC
       LIMIT 1`,
      [ZR_CARRIER_KEY]
    );
    row = rows[0];
  } finally {
    await p.end();
  }

  if (!row) {
    console.error(`No carrier_connections row found for carrier="${ZR_CARRIER_KEY}" or label/carrier ILIKE '%zr%'.`);
    process.exit(1);
  }

  console.log(`Connection: id=${row.id} carrier=${row.carrier} label="${row.label}" status=${row.status}`);

  let creds;
  try {
    creds = decryptCredentials(row.credentials);
  } catch (e) {
    console.error(`Failed to decrypt credentials: ${e.message}`);
    process.exit(1);
  }

  if (!creds.token || !creds.key) {
    console.error("Decrypted credentials are missing `token` and/or `key` — cannot authenticate.");
    process.exit(1);
  }
  const { token, key } = creds;
  console.log(`Token present: ${token.length} chars, Key present: ${key.length} chars (neither printed). Base URL: ${ZR_BASE_URL}`);

  const communeResults = await probeGroup("Commune candidates", COMMUNE_CANDIDATES, token, key);
  const deskResults = await probeGroup("Desk/office candidates", DESK_CANDIDATES, token, key);
  const feeResults = await probeGroup("Fee candidates", FEE_CANDIDATES, token, key);

  const all = [...communeResults, ...deskResults, ...feeResults];
  const found = all.filter(r => r.status === 200);
  const notFound = all.filter(r => r.status === 404);
  const authRejected = all.filter(r => r.status === 401 || r.status === 403);
  const other = all.filter(r => ![200, 404, 401, 403].includes(r.status));

  console.log("\n── Summary ──");
  console.log(`200 OK (${found.length}): ${found.map(r => r.path).join(", ") || "none"}`);
  console.log(`404 (${notFound.length}): ${notFound.map(r => r.path).join(", ") || "none"}`);
  console.log(`401/403 (${authRejected.length}): ${authRejected.map(r => r.path).join(", ") || "none"}`);
  console.log(`Other/error (${other.length}): ${other.map(r => `${r.path} [${r.status ?? "ERR"}]`).join(", ") || "none"}`);

  if (authRejected.length === all.length) {
    console.log(
      "\nEvery single path was rejected as unauthorized — this points at the " +
      "token/key pair itself (or the header shape) being wrong, not just wrong paths. " +
      "Worth double-checking against a request that's known to work (e.g. a real add_colis call) before concluding these endpoints don't exist."
    );
  }
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
