const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });
(async () => {
  const c = await p.query("SELECT conname, pg_get_constraintdef(oid) def FROM pg_constraint WHERE conrelid='orders'::regclass AND contype IN ('u','p')");
  console.log('CONSTRAINTS:');
  c.rows.forEach(r => console.log('  ', r.conname, '=>', r.def));
  const i = await p.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='orders' AND indexdef ILIKE '%UNIQUE%'");
  console.log('UNIQUE INDEXES:');
  i.rows.forEach(r => console.log('  ', r.indexname, '=>', r.indexdef));
  const col = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name IN ('commune','shopify_order_id','address')");
  console.log('COLS PRESENT:', col.rows.map(r => r.column_name).join(', '));
  const dup = await p.query("SELECT shopify_order_id, COUNT(*) n FROM orders WHERE shopify_order_id IS NOT NULL GROUP BY shopify_order_id HAVING COUNT(*)>1");
  console.log('DUPLICATE shopify_order_id GROUPS:', dup.rowCount);
  dup.rows.forEach(r => console.log('  ', r.shopify_order_id, 'x', r.n));
  const tot = await p.query("SELECT COUNT(*) total, COUNT(shopify_order_id) with_shopify FROM orders");
  console.log('ORDERS:', JSON.stringify(tot.rows[0]));
  await p.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
