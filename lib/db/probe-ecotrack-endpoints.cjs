// One-off: probe the live Anderson Ecotrack tenant for a desk/office/stopdesk
// listing endpoint that isn't in any public Ecotrack docs or client we've
// found (see the DZBuild-com/dzship investigation — nothing there either).
//
// Read-only. Only ever issues GET requests. Never calls api/v1/create/order
// or any other endpoint that could write/mutate carrier-side state.
//
// Reuses the same encryption scheme as
// artifacts/api-server/src/lib/credentials-crypto.ts (decryptCredentials) —
// duplicated here in plain crypto rather than imported, since that file is
// TypeScript and this is a standalone .cjs script; kept byte-for-byte
// identical (same algo, same scrypt salt, same env vars) so it decrypts the
// exact same carrier_connections.credentials blobs.
//
// Tenant domain (https://anderson-ecommerce.ecotrack.dz/) and auth scheme
// (Authorization: Bearer {token}) are taken from
// artifacts/api-server/src/lib/carriers/ecotrack.ts (ECOTRACK_TENANTS.anderson_ecotrack)
// rather than re-derived, so this probes the exact tenant the app itself uses.
//
// Never prints the token or the raw credentials payload.
//
// Usage:
//   node lib/db/probe-ecotrack-endpoints.cjs
const { Pool } = require("pg");
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const ANDERSON_CARRIER_KEY = "anderson_ecotrack";
const ANDERSON_DOMAIN = "https://anderson-ecommerce.ecotrack.dz/";

const KNOWN_ENDPOINTS = ["get/wilayas", "get/communes", "get/fees"];

const CANDIDATE_ENDPOINTS = [
  "get/desks",
  "get/stopdesks",
  "get/stop-desks",
  "get/offices",
  "get/agencies",
  "get/centers",
  "get/centres",
  "get/bureaux",
  "get/hubs",
  "get/stations",
  "get/points",
  "get/relais",
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

async function probe(domain, path, token) {
  const url = `${domain}api/v1/${path}`;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
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

(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

  let row;
  try {
    const { rows } = await p.query(
      `SELECT id, store_id, carrier, label, status, credentials
       FROM carrier_connections
       WHERE carrier ILIKE $1 OR carrier ILIKE '%anderson%' OR label ILIKE '%anderson%'
       ORDER BY created_at DESC
       LIMIT 1`,
      [ANDERSON_CARRIER_KEY]
    );
    row = rows[0];
  } finally {
    await p.end();
  }

  if (!row) {
    console.error(`No carrier_connections row found for carrier="${ANDERSON_CARRIER_KEY}" or label ILIKE '%anderson%'.`);
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

  if (!creds.token) {
    console.error("Decrypted credentials have no `token` field — cannot authenticate.");
    process.exit(1);
  }
  const token = creds.token;
  console.log(`Token present: ${token.length} chars (not printed). Domain: ${ANDERSON_DOMAIN}\n`);

  console.log("── Known endpoints (sanity check the token works) ──");
  for (const path of KNOWN_ENDPOINTS) {
    const r = await probe(ANDERSON_DOMAIN, path, token);
    console.log(`  [${r.status ?? "ERR"}] ${r.path}\n      ${r.sample}`);
  }

  console.log("\n── Candidate desk/office endpoints ──");
  const results = [];
  for (const path of CANDIDATE_ENDPOINTS) {
    const r = await probe(ANDERSON_DOMAIN, path, token);
    results.push(r);
    console.log(`  [${r.status ?? "ERR"}] ${r.path}\n      ${r.sample}`);
  }

  const found = results.filter(r => r.status === 200);
  const notFound = results.filter(r => r.status === 404);
  const other = results.filter(r => r.status !== 200 && r.status !== 404);

  console.log("\n── Summary ──");
  console.log(`200 OK (${found.length}): ${found.map(r => r.path).join(", ") || "none"}`);
  console.log(`404 (${notFound.length}): ${notFound.map(r => r.path).join(", ") || "none"}`);
  console.log(`Other/error (${other.length}): ${other.map(r => `${r.path} [${r.status ?? "ERR"}]`).join(", ") || "none"}`);
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
