/**
 * Billing Status Fix — DB Migration
 * Run: pnpm --filter @workspace/scripts exec tsx ./src/migrate-billing-status.ts
 *
 * Adds "starter" and "agency" to the "plan" enum. Production already has
 * these values (confirmed via pg_enum) — this is for any other environment
 * (dev/staging) still on the checked-in schema's old 4-value definition.
 * No changes needed to "subscription_status" — the Stripe status mapping
 * fix buckets everything into the 4 values that already exist there.
 */
import { pool } from "@workspace/db";

(async () => {
  console.log("[Migration] Starting billing status schema migration...");

  const migrations = [
    `ALTER TYPE plan ADD VALUE IF NOT EXISTS 'starter'`,
    `ALTER TYPE plan ADD VALUE IF NOT EXISTS 'agency'`,
  ];

  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log("[Migration] OK:", sql);
    } catch (err: any) {
      console.error("[Migration] FAIL:", sql, "—", err.message);
    }
  }

  await pool.end();
  console.log("[Migration] Done.");
})();
