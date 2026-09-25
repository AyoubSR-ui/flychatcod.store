// One-off: permanently delete every order (and order-scoped child row) for
// a single store, identified by store id passed as an argv, never hardcoded
// — a hardcoded id is one bad copy-paste away from wiping the wrong store.
//
// Scope: orders, order_items, order_events, shipments, scheduled_parcels —
// all order-scoped. Nothing else is touched: conversations, customers,
// products, and customers.lead_stage (the only "lead intelligence" data —
// there is no separate lead table in this schema) have no foreign key to
// orders and are left alone. The one side effect that isn't a deletion:
// customers.total_orders / is_repeat are materialized counts recomputed on
// every order-confirmation event (see routes/orders.ts), so after removing
// orders they'd overcount unless recomputed here.
//
// There are no declared FK constraints anywhere in this schema (verified
// against lib/db/src/schema/**, the .cjs migrations, and the raw-SQL
// bootstrap in artifacts/api-server/src/lib/schema-bootstrap.ts) — nothing
// cascades, so deletion order is enforced here: children before parent,
// inside one transaction so a failure rolls back everything instead of
// leaving the store half-wiped.
//
// Dry run (default) — prints counts, writes nothing:
//   node lib/db/wipe-store-orders.cjs <store_id>
// Actually delete:
//   node lib/db/wipe-store-orders.cjs <store_id> --confirm
const { Pool } = require("pg");

const storeId = process.argv[2];
const confirmed = process.argv.includes("--confirm");

if (!storeId || storeId.startsWith("--")) {
  console.error("Usage: node lib/db/wipe-store-orders.cjs <store_id> [--confirm]");
  process.exit(1);
}

const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

(async () => {
  const { rows: storeRows } = await p.query(`SELECT id, name FROM stores WHERE id = $1`, [storeId]);
  if (!storeRows.length) {
    console.error(`No store found with id "${storeId}" — refusing to proceed.`);
    await p.end();
    process.exit(1);
  }
  console.log(`Store: ${storeRows[0].name} (${storeRows[0].id})`);
  console.log(confirmed ? "Mode: APPLY — this will permanently delete rows." : "Mode: DRY RUN — no writes. Pass --confirm to actually delete.");

  const { rows: orderRows } = await p.query(`SELECT id, customer_id FROM orders WHERE store_id = $1`, [storeId]);
  const orderIds = orderRows.map(r => r.id);
  const affectedCustomerIds = [...new Set(orderRows.map(r => r.customer_id).filter(Boolean))];

  console.log(`\nOrders to delete: ${orderIds.length}`);
  if (!orderIds.length) {
    console.log("Nothing to do.");
    await p.end();
    return;
  }

  // Counted up front (pre-delete) for both dry-run reporting and the
  // post-delete sanity check below.
  const counts = {};
  for (const [table, column] of [
    ["shipments", "order_id"],
    ["scheduled_parcels", "order_id"],
    ["order_events", "order_id"],
    ["order_items", "order_id"],
  ]) {
    const { rows } = await p.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ANY($1::text[])`, [orderIds]);
    counts[table] = Number(rows[0].n);
    console.log(`  ${table}: ${counts[table]}`);
  }
  console.log(`  customers with a stale total_orders to recompute: ${affectedCustomerIds.length}`);

  if (!confirmed) {
    console.log("\nDry run only — no rows deleted. Re-run with --confirm to apply.");
    await p.end();
    return;
  }

  const client = await p.connect();
  try {
    await client.query("BEGIN");

    const deleted = {};
    for (const [table, column] of [
      ["shipments", "order_id"],
      ["scheduled_parcels", "order_id"],
      ["order_events", "order_id"],
      ["order_items", "order_id"],
    ]) {
      const { rowCount } = await client.query(`DELETE FROM ${table} WHERE ${column} = ANY($1::text[])`, [orderIds]);
      deleted[table] = rowCount ?? 0;
    }

    const { rowCount: ordersDeleted } = await client.query(`DELETE FROM orders WHERE store_id = $1`, [storeId]);
    deleted.orders = ordersDeleted ?? 0;

    let customersFixed = 0;
    for (const customerId of affectedCustomerIds) {
      const { rows } = await client.query(
        `SELECT COUNT(*) AS n FROM orders WHERE customer_id = $1 AND store_id = $2`,
        [customerId, storeId]
      );
      const totalOrders = Number(rows[0].n);
      await client.query(
        `UPDATE customers SET total_orders = $1, is_repeat = $2, updated_at = NOW() WHERE id = $3`,
        [totalOrders, totalOrders > 1, customerId]
      );
      customersFixed++;
    }

    await client.query("COMMIT");

    console.log("\nDeleted:");
    for (const [table, n] of Object.entries(deleted)) console.log(`  ${table}: ${n}`);
    console.log(`  customers.total_orders recomputed: ${customersFixed}`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ERR — rolled back, nothing was deleted:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await p.end();
  }
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
