// One-off: add shopify_app_client_id to stores, and backfill existing
// Shopify-connected stores with FLychatcod's client_id (the only app
// that had installs before the two-app split). Guarded so re-running is
// a no-op. Safe to delete after it has been applied to every environment.
const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

const FLYCHATCOD_CLIENT_ID = "2f5b14d98872b471a6f0e5d7f3e49f8c";

(async () => {
  await p.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS shopify_app_client_id TEXT`);

  const { rows: before } = await p.query(
    `SELECT id, shopify_shop FROM stores WHERE shopify_shop IS NOT NULL AND shopify_app_client_id IS NULL`
  );
  if (before.length === 0) {
    console.log("No connected stores need backfilling — nothing to do.");
    await p.end();
    return;
  }

  const { rowCount } = await p.query(
    `UPDATE stores SET shopify_app_client_id = $1, updated_at = NOW()
     WHERE shopify_shop IS NOT NULL AND shopify_app_client_id IS NULL`,
    [FLYCHATCOD_CLIENT_ID]
  );
  console.log(`BACKFILLED: ${rowCount} store(s) ->`, before.map(r => r.shopify_shop).join(", "));
  await p.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
