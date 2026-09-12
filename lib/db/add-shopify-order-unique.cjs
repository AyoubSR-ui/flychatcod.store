// One-off: add the unique constraint that makes Shopify order imports
// idempotent. Guarded so re-running is a no-op. Safe to delete after it has
// been applied to every environment.
const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

(async () => {
  // Pre-flight: the constraint can only be created if no duplicates exist.
  const dup = await p.query(`
    SELECT store_id, shopify_order_id, COUNT(*) n
    FROM orders
    WHERE shopify_order_id IS NOT NULL
    GROUP BY store_id, shopify_order_id
    HAVING COUNT(*) > 1
  `);
  if (dup.rowCount > 0) {
    console.error(`ABORT: ${dup.rowCount} duplicate (store_id, shopify_order_id) group(s) must be merged first:`);
    dup.rows.forEach(r => console.error("  ", r.store_id, r.shopify_order_id, "x", r.n));
    process.exit(1);
  }

  const { rows: before } = await p.query(`
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_store_shopify_order_id_unique'
  `);
  if (before.length) {
    console.log("Constraint orders_store_shopify_order_id_unique already exists — nothing to do.");
    await p.end();
    return;
  }

  await p.query(`
    ALTER TABLE orders
    ADD CONSTRAINT orders_store_shopify_order_id_unique
    UNIQUE (store_id, shopify_order_id)
  `);

  const { rows: after } = await p.query(`
    SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_store_shopify_order_id_unique'
  `);
  console.log("ADDED:", after[0].conname, "=>", after[0].def);
  await p.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
