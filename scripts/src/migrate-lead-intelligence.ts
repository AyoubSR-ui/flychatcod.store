/**
 * Lead Intelligence System — DB Migration
 * Run: pnpm --filter @workspace/scripts exec tsx ./src/migrate-lead-intelligence.ts
 */
import { pool } from "@workspace/db";

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

(async () => {
  console.log("[Migration] Starting Lead Intelligence schema migration...");
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log("[Migration] OK:", sql.slice(0, 70).replace(/\n/g, " "));
    } catch (err: any) {
      console.error("[Migration] FAIL:", err.message);
    }
  }
  await pool.end();
  console.log("[Migration] Done.");
})();
