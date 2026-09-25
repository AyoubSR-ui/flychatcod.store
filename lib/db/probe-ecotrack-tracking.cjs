// One-off: probe the live Anderson Ecotrack tenant (SK Elegance's connection)
// for real parcel-tracking endpoints, ahead of building status polling.
//
// Candidate endpoints come from CodFlow (github.com/bighadj22/codflow), a
// live-tested open-source Ecotrack integration — see its
// providers/ecotrack/adapter.ts and .agents/skills/Ecotrack/CONFORMANCE.md:
//   - GET api/v1/get/trackings/info?trackings[]=...   (bulk, <=100, Bearer auth,
//     success shape flagged UNVERIFIED by CodFlow itself — this probe is partly
//     to observe it directly)
//   - GET api/v1/get/orders/status?api_token=&trackings=&status=all (<=100,
//     documented api_token QUERY-PARAM auth exception — Bearer header alone is
//     not accepted per CodFlow's own test)
//   - GET api/v1/get/orders?tracking=...              (single-order lookup via
//     the paginated listing endpoint, Bearer auth)
//
// Read-only. Only ever issues GET requests. Never calls create/update/cancel,
// ask/for/order/return, valid/returns, or any other endpoint that could
// write/mutate carrier-side state.
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
// Targets connection carr_d8e52f79dcf5b00b63c77a77 specifically (SK Elegance's
// Anderson connection) rather than a generic ILIKE search — that store alone
// has 280 shipments, real enough tracking numbers to test against.
//
// Never prints the token or the raw credentials payload.
//
// This script is written but intentionally NOT run — do not execute it
// without checking with the user first.
//
// Usage:
//   node lib/db/probe-ecotrack-tracking.cjs
const { Pool } = require("pg");
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const TARGET_CONNECTION_ID = "carr_d8e52f79dcf5b00b63c77a77";
const ANDERSON_DOMAIN = "https://anderson-ecommerce.ecotrack.dz/";
const TRACKING_SAMPLE_SIZE = 3;

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

function shortSample(text, max = 500) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

async function probeGet(url) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${GLOBAL_TOKEN}`, Accept: "application/json" },
    });
    const bodyText = await res.text();
    let sample;
    try {
      sample = shortSample(JSON.stringify(JSON.parse(bodyText)));
    } catch {
      sample = shortSample(bodyText);
    }
    return { status: res.status, ok: res.ok, sample };
  } catch (e) {
    return { status: null, ok: false, sample: `ERROR: ${e.message}` };
  }
}

let GLOBAL_TOKEN = "";

(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

  let connectionRow;
  let trackingRows;
  try {
    const { rows } = await p.query(
      `SELECT id, store_id, carrier, label, status, credentials
       FROM carrier_connections
       WHERE id = $1
       LIMIT 1`,
      [TARGET_CONNECTION_ID]
    );
    connectionRow = rows[0];

    if (connectionRow) {
      const { rows: shipmentRows } = await p.query(
        `SELECT tracking_number, status
         FROM shipments
         WHERE carrier_connection_id = $1 AND tracking_number IS NOT NULL
         ORDER BY created_at DESC
         LIMIT $2`,
        [TARGET_CONNECTION_ID, TRACKING_SAMPLE_SIZE]
      );
      trackingRows = shipmentRows;
    }
  } finally {
    await p.end();
  }

  if (!connectionRow) {
    console.error(`No carrier_connections row found for id=${TARGET_CONNECTION_ID}.`);
    process.exit(1);
  }

  console.log(`Connection: id=${connectionRow.id} carrier=${connectionRow.carrier} label="${connectionRow.label}" status=${connectionRow.status}`);

  if (!trackingRows || trackingRows.length === 0) {
    console.error(`No shipments with a tracking_number found for carrier_connection_id=${TARGET_CONNECTION_ID}.`);
    process.exit(1);
  }

  const trackingNumbers = trackingRows.map(r => r.tracking_number);
  console.log(`Tracking numbers (${trackingNumbers.length}): ${trackingNumbers.join(", ")}`);
  console.log(`Current stored statuses: ${trackingRows.map(r => r.status).join(", ")}\n`);

  let creds;
  try {
    creds = decryptCredentials(connectionRow.credentials);
  } catch (e) {
    console.error(`Failed to decrypt credentials: ${e.message}`);
    process.exit(1);
  }

  if (!creds.token) {
    console.error("Decrypted credentials have no `token` field — cannot authenticate.");
    process.exit(1);
  }
  GLOBAL_TOKEN = creds.token;
  console.log(`Token present: ${GLOBAL_TOKEN.length} chars (not printed). Domain: ${ANDERSON_DOMAIN}\n`);

  // ── 1. Bulk tracking info (Bearer auth, repeated trackings[] params) ──
  console.log("── get/trackings/info (bulk, Bearer auth) ──");
  {
    const params = new URLSearchParams();
    for (const t of trackingNumbers) params.append("trackings[]", t);
    const url = `${ANDERSON_DOMAIN}api/v1/get/trackings/info?${params.toString()}`;
    const r = await probeGet(url);
    console.log(`  [${r.status ?? "ERR"}] ${url}\n      ${r.sample}\n`);
  }

  // ── 2. Order status filter (documented api_token QUERY-PARAM auth exception) ──
  console.log("── get/orders/status (api_token query-param auth) ──");
  {
    const params = new URLSearchParams({ api_token: GLOBAL_TOKEN });
    params.set("trackings", trackingNumbers.join(","));
    params.set("status", "all");
    const url = `${ANDERSON_DOMAIN}api/v1/get/orders/status?${params.toString()}`;
    const r = await probeGet(url);
    console.log(`  [${r.status ?? "ERR"}] api/v1/get/orders/status?trackings=...&status=all (token redacted from log)\n      ${r.sample}\n`);
  }

  // ── 3. Single-order lookup via the paginated orders listing (Bearer auth) ──
  console.log("── get/orders?tracking=<single> (Bearer auth, one call per tracking) ──");
  for (const t of trackingNumbers) {
    const url = `${ANDERSON_DOMAIN}api/v1/get/orders?tracking=${encodeURIComponent(t)}`;
    const r = await probeGet(url);
    console.log(`  [${r.status ?? "ERR"}] tracking=${t}\n      ${r.sample}\n`);
  }

  console.log("── Done ──");
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
