import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("./lib/db/node_modules/pg");

const DATABASE_URL =
  "postgresql://postgres:UVMKQunzpnrMCGXafgyOPbexXQtgGSGE@autorack.proxy.rlwy.net:14102/railway";

async function run() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✓ Connected\n");

  const q = async (label, sql) => {
    console.log(`── ${label} ${"─".repeat(Math.max(0, 50 - label.length))}`);
    const { rows } = await client.query(sql);
    console.table(rows);
    return rows;
  };

  // ── Diagnostics ────────────────────────────────────────────────────────────
  await q("1. messages.conversation_id LIMIT 5",
    "SELECT conversation_id FROM messages LIMIT 5");

  await q("2. conversations id/store_id/customer_name LIMIT 5",
    "SELECT id, store_id, customer_name FROM conversations LIMIT 5");

  await q("3. JOIN count (messages ↔ conversations)",
    "SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id");

  await q("4. Distinct conversation_ids in messages (sample 5)",
    "SELECT DISTINCT conversation_id FROM messages LIMIT 5");

  await q("5. Total messages vs joinable",
    `SELECT
       (SELECT COUNT(*) FROM messages) AS total_messages,
       (SELECT COUNT(DISTINCT conversation_id) FROM messages) AS distinct_conv_ids_in_messages,
       (SELECT COUNT(*) FROM conversations) AS total_conversations,
       (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id) AS joinable_messages`);

  // ── Lead columns migration ─────────────────────────────────────────────────
  console.log("\n── Lead Intelligence Migration ────────────────────────────────");
  const migrations = [
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'interested'`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS intent_level TEXT DEFAULT 'low'`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS order_stage TEXT DEFAULT 'pending'`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS qualified_at TIMESTAMP`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_product TEXT`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_size TEXT`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_color TEXT`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_wilaya TEXT`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_phone TEXT`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_delivery_type TEXT`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_confirmed BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ad_ref TEXT`,
    `CREATE TABLE IF NOT EXISTS lead_events (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_data JSONB DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const sql of migrations) {
    try {
      await client.query(sql);
      console.log(`  ✓ ${sql.slice(0, 70).replace(/\n/g, " ").trimEnd()}...`);
    } catch (err) {
      console.log(`  ✗ ${err.message.slice(0, 80)}`);
    }
  }

  // ── Backfill lead stages ───────────────────────────────────────────────────
  console.log("\n── Lead Stage Backfill ─────────────────────────────────────────");

  const r1 = await client.query(`
    UPDATE conversations
    SET lead_stage = 'engaged', intent_level = 'medium'
    WHERE id IN (
      SELECT conversation_id FROM messages
      GROUP BY conversation_id
      HAVING COUNT(*) >= 10
    )
    AND lead_stage = 'interested'
  `);
  console.log(`  engaged backfill:          ${r1.rowCount} rows updated`);

  const r2 = await client.query(`
    UPDATE conversations
    SET lead_stage = 'qualified_lead', intent_level = 'high', qualified_at = NOW()
    WHERE id IN (
      SELECT conversation_id FROM messages
      GROUP BY conversation_id
      HAVING COUNT(*) >= 20
    )
    AND lead_stage IN ('interested', 'engaged')
  `);
  console.log(`  qualified_lead backfill:   ${r2.rowCount} rows updated`);

  // ── Verify ────────────────────────────────────────────────────────────────
  await q("Lead stage distribution",
    `SELECT lead_stage, COUNT(*) as count
     FROM conversations
     GROUP BY lead_stage
     ORDER BY count DESC`);

  await q("Intent level distribution",
    `SELECT intent_level, COUNT(*) as count
     FROM conversations
     GROUP BY intent_level
     ORDER BY count DESC`);

  await q("Conversations with lead columns (sample)",
    `SELECT id, customer_name, lead_stage, intent_level, qualified_at
     FROM conversations
     WHERE lead_stage != 'interested'
     LIMIT 10`);

  await client.end();
  console.log("\n✓ Done");
}

run().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
