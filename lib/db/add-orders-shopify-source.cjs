// One-off: add orders.shopify_source and backfill it for existing rows.
// Guarded so re-running is a no-op. Safe to delete after it has been
// applied to every environment.
//
// Backfill condition: shopify_order_id IS NOT NULL AND customer_id IS NULL.
// customer_id is never set by Shopify sync/webhook code (confirmed — those
// paths only ever write customer_name/phone/email denormalized on the order
// row), so a non-null customer_id on a Shopify-order-id row means it was a
// chat order later pushed to Shopify (pushOrderToShopify, now removed) —
// that's the split this migration is keying off of.
const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

(async () => {
  const { rows: before } = await p.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'shopify_source'`
  );
  if (before.length) {
    console.log("Column orders.shopify_source already exists — nothing to do.");
    await p.end();
    return;
  }

  // Report the split before touching anything, so it's visible in the
  // migration's own output (not just a prior read-only check).
  const { rows: split } = await p.query(`
    SELECT
      COUNT(*) FILTER (WHERE shopify_order_id IS NOT NULL AND customer_id IS NULL)     AS shopify_sourced,
      COUNT(*) FILTER (WHERE shopify_order_id IS NOT NULL AND customer_id IS NOT NULL) AS chat_pushed_to_shopify,
      COUNT(*) FILTER (WHERE shopify_order_id IS NOT NULL)                             AS total_with_shopify_order_id
    FROM orders
  `);
  console.log("Split before backfill:", split[0]);

  await p.query(`ALTER TABLE orders ADD COLUMN shopify_source BOOLEAN NOT NULL DEFAULT false`);

  const { rowCount } = await p.query(`
    UPDATE orders SET shopify_source = true
    WHERE shopify_order_id IS NOT NULL AND customer_id IS NULL
  `);
  console.log(`ADDED column, backfilled shopify_source = true for ${rowCount} row(s).`);
  await p.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
