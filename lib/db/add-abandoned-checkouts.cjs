// One-off: create the abandoned_checkouts table (Shopify abandoned checkout
// tracking — checkouts/create, checkouts/update webhooks, and the
// POST /api/shopify/backfill-abandoned-checkouts endpoint).
// Mirrors ensureAbandonedCheckoutsTable() in
// artifacts/api-server/src/lib/schema-bootstrap.ts, which creates the same
// table lazily at request time — this script just applies it immediately
// instead of waiting for the first request to hit it. Guarded so re-running
// is a no-op. Safe to delete after it has been applied to every environment.
const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

(async () => {
  const { rows: before } = await p.query(
    `SELECT to_regclass('public.abandoned_checkouts') AS reg`
  );
  if (before[0]?.reg) {
    console.log("Table abandoned_checkouts already exists — nothing to do.");
    await p.end();
    return;
  }

  await p.query(`
    CREATE TABLE abandoned_checkouts (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      shopify_checkout_id TEXT NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      customer_email TEXT,
      wilaya TEXT,
      commune TEXT,
      items JSONB NOT NULL DEFAULT '[]',
      total NUMERIC NOT NULL DEFAULT 0,
      abandoned_at TIMESTAMP NOT NULL DEFAULT NOW(),
      recovery_url TEXT,
      converted_order_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`CREATE UNIQUE INDEX abandoned_checkouts_store_shopify_id_idx ON abandoned_checkouts (store_id, shopify_checkout_id)`);
  await p.query(`CREATE INDEX abandoned_checkouts_store_converted_idx ON abandoned_checkouts (store_id, converted_order_id)`);

  const { rows: after } = await p.query(`SELECT to_regclass('public.abandoned_checkouts') AS reg`);
  console.log("CREATED:", after[0].reg);
  await p.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
