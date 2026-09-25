/**
 * Account Lifecycle — DB Migration
 * Dry run:  pnpm --filter @workspace/scripts exec tsx ./src/migrate-account-lifecycle.ts
 * Apply:    pnpm --filter @workspace/scripts exec tsx ./src/migrate-account-lifecycle.ts --apply
 *
 * 1. Adds "removed" to the team_status enum (see lib/db/src/schema/team.ts —
 *    a removed team member's users row is hard-deleted but the team_members
 *    row itself is kept, marked removed, so past orders and the performance
 *    dashboard can still resolve an agent name).
 * 2. Cleans up pre-existing duplicate (email, store_id) rows in users, then
 *    creates the unique index that stops new ones — see
 *    lib/db/src/schema/users.ts's users_email_store_id_idx. Rows with
 *    store_id NULL (abandoned signups pre-onboarding) are left untouched:
 *    Postgres never treats two NULLs as colliding, so they don't block the
 *    index and aren't this migration's concern.
 *
 *    Within each duplicate (email, store_id) group, the row kept is: the
 *    one with a matching team_members row (tm.user_id = users.id AND
 *    tm.store_id = users.store_id) if any exist, oldest first; otherwise
 *    just the oldest row. Everything else in the group is deleted — no
 *    orders/conversations/customers reference users directly, so this never
 *    touches that data.
 *
 * Defaults to a dry run that only reports what --apply would delete. Run
 * without --apply first and review the counts before re-running with it.
 */
import { pool } from "@workspace/db";

const APPLY = process.argv.includes("--apply");

(async () => {
  try {
    await run();
  } catch (err: any) {
    console.error("[Migration] FAIL: unexpected error, nothing further was applied:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

async function run() {
  console.log(`[Migration] Starting account-lifecycle migration (${APPLY ? "APPLY" : "DRY RUN"})...`);

  // ── 1. team_status enum ──────────────────────────────────────────────────
  try {
    await pool.query(`ALTER TYPE team_status ADD VALUE IF NOT EXISTS 'removed'`);
    console.log("[Migration] OK: team_status enum has 'removed'");
  } catch (err: any) {
    console.error("[Migration] FAIL: adding 'removed' to team_status:", err.message);
  }

  // ── 2. Duplicate (email, store_id) users rows ────────────────────────────
  // No ORDER BY / ROW_NUMBER here on purpose — ranking (including the tie
  // break) happens in JS below, where "keep" is a value we can log and
  // reason about instead of a query plan we have to trust blindly.
  const { rows: duplicates } = await pool.query(`
    SELECT
      u.id, u.email, u.store_id, u.role, u.created_at,
      EXISTS(
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = u.id AND tm.store_id = u.store_id
      ) AS has_team_row
    FROM users u
    JOIN (
      SELECT email, store_id
      FROM users
      WHERE store_id IS NOT NULL
      GROUP BY email, store_id
      HAVING COUNT(*) > 1
    ) g ON g.email = u.email AND g.store_id = u.store_id
    ORDER BY u.email, u.store_id, u.created_at
  `);

  // (email, store_id) is the grouping key throughout — the same email on two
  // different stores (e.g. one account on Brivanaa, another on Sk elegance)
  // is two separate groups of size 1 each and never appears here at all.
  const groups = new Map<string, typeof duplicates>();
  for (const row of duplicates) {
    const key = `${row.email}::${row.store_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  console.log(`[Migration] ${groups.size} duplicate (email, store_id) group(s), ${duplicates.length} row(s) total involved.`);

  const toDelete: string[] = [];
  const unresolved: string[] = [];

  for (const [key, rows] of groups) {
    const [email, storeId] = key.split("::");
    console.log(`  ${email} / store ${storeId} — ${rows.length} accounts:`);
    for (const r of rows as any[]) {
      console.log(`    ${r.id}  created ${r.created_at?.toISOString?.() ?? r.created_at}  role=${r.role}  has_team_row=${r.has_team_row}`);
    }

    // Prefer a row with a team_members row (oldest among those); if NONE of
    // them have one — e.g. sikeayoub4@gmail.com's 3 Brivanaa accounts —
    // fall back to the oldest row overall rather than refusing to resolve
    // the group. created_at ties (same millisecond) are broken by id so the
    // choice is deterministic instead of depending on row fetch order.
    const withTeamRow = (rows as any[]).filter(r => r.has_team_row);
    const pool2 = withTeamRow.length > 0 ? withTeamRow : (rows as any[]);
    const sorted = [...pool2].sort((a, b) => {
      const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return t !== 0 ? t : String(a.id).localeCompare(String(b.id));
    });
    const keep = sorted[0];

    if (!keep) {
      // Should be unreachable (every group has at least 2 rows), but this
      // is exactly the kind of assumption that crashed last time — never
      // let an unexpected shape halt the whole run.
      console.error(`    UNRESOLVED: could not pick a row to keep for this group — skipping, no rows in this group will be touched.`);
      unresolved.push(key);
      continue;
    }

    const remove = (rows as any[]).filter(r => r.id !== keep.id);
    console.log(`    -> keep ${keep.id}${withTeamRow.length === 0 ? " (none of these have a team_members row — kept the oldest)" : ""}`);
    console.log(`    -> delete ${remove.length}: ${remove.map(r => r.id).join(", ") || "(none)"}`);
    toDelete.push(...remove.map(r => r.id));
  }

  if (unresolved.length > 0) {
    console.warn(`[Migration] ${unresolved.length} group(s) could not be resolved and were left untouched: ${unresolved.join(", ")}`);
  }

  if (!APPLY) {
    console.log(`[Migration] Dry run only — would delete ${toDelete.length} row(s) total. No rows deleted, no index created. Re-run with --apply to apply.`);
    return;
  }

  if (unresolved.length > 0) {
    console.error(`[Migration] Refusing to apply: ${unresolved.length} group(s) are unresolved. Fix the data or this script, then re-run.`);
    process.exitCode = 1;
    return;
  }

  if (toDelete.length > 0) {
    const { rowCount } = await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [toDelete]);
    console.log(`[Migration] OK: deleted ${rowCount} duplicate users row(s)`);
  } else {
    console.log("[Migration] OK: no duplicate rows to delete");
  }

  try {
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_store_id_idx ON users (email, store_id)`);
    console.log("[Migration] OK: created users_email_store_id_idx");
  } catch (err: any) {
    console.error("[Migration] FAIL: creating users_email_store_id_idx:", err.message);
  }

  console.log("[Migration] Done.");
}
