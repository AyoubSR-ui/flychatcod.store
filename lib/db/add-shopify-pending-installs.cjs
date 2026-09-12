// One-off: create the shopify_pending_installs table used by GET /install ->
// /callback (a shop-initiated install with no FlyChat account yet) and
// POST /api/shopify/claim. Guarded so re-running is a no-op. Safe to delete
// after it has been applied to every environment.
const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

(async () => {
  const { rows: before } = await p.query(
    `SELECT to_regclass('public.shopify_pending_installs') AS reg`
  );
  if (before[0]?.reg) {
    console.log("Table shopify_pending_installs already exists — nothing to do.");
    await p.end();
    return;
  }

  await p.query(`
    CREATE TABLE shopify_pending_installs (
      id TEXT PRIMARY KEY,
      shop TEXT NOT NULL,
      access_token TEXT NOT NULL,
      scope TEXT,
      client_id TEXT NOT NULL,
      claim_token_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      claimed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Lookups in POST /claim are always by claim_token_hash.
  await p.query(`CREATE UNIQUE INDEX shopify_pending_installs_claim_token_hash_idx ON shopify_pending_installs (claim_token_hash)`);

  const { rows: after } = await p.query(`SELECT to_regclass('public.shopify_pending_installs') AS reg`);
  console.log("CREATED:", after[0].reg);
  await p.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
