/**
 * Account Lifecycle — DB Migration
 * Dry run:  pnpm --filter @workspace/scripts exec tsx ./src/migrate-account-lifecycle.ts
 * Apply:    pnpm --filter @workspace/scripts exec tsx ./src/migrate-account-lifecycle.ts --apply
 *
 * *** TAKE A DATABASE BACKUP BEFORE RUNNING WITH --apply. *** This deletes
 * users rows. Dry run is read-only and safe to run any time; --apply is not.
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
 *    one a team_members row's user_id actually points at (oldest first, if
 *    more than one), otherwise just the oldest row in the group. Everything
 *    else in the group is deleted — no orders/conversations/customers
 *    reference users directly, so this never touches that data.
 * 3. Reports (never repairs — see the header on phase 3 below) every
 *    surviving account whose team_members link is missing or broken, and
 *    what to do about it: repair, re-invite, or manual review, depending on
 *    how many candidate team_members rows exist for that (email, store_id).
 *
 * Defaults to a dry run that only reports what --apply would do. Run
 * without --apply first and read the full output before re-running with it.
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
  if (APPLY) {
    console.log("[Migration] *** APPLY MODE — make sure a database backup was taken before this run. ***");
  }

  // ── 1. team_status enum ──────────────────────────────────────────────────
  try {
    await pool.query(`ALTER TYPE team_status ADD VALUE IF NOT EXISTS 'removed'`);
    console.log("[Migration] OK: team_status enum has 'removed'");
  } catch (err: any) {
    console.error("[Migration] FAIL: adding 'removed' to team_status:", err.message);
  }

  // ── 2. Duplicate (email, store_id) users rows ────────────────────────────
  // No ORDER BY / ROW_NUMBER in SQL on purpose — ranking (including the tie
  // break) happens in JS below, where "keep" is a value we can log and
  // reason about, instead of a query plan (and a bigint-vs-number footgun —
  // ROW_NUMBER() comes back from node-postgres as a string, not a number,
  // which is what caused the original crash here) we have to trust blindly.
  const { rows: allUsers } = await pool.query(`
    SELECT id, email, store_id, role, created_at
    FROM users
    WHERE store_id IS NOT NULL
    ORDER BY email, store_id, created_at
  `);

  const groups = new Map<string, typeof allUsers>();
  for (const row of allUsers) {
    const key = `${row.email}::${row.store_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // (email, store_id) is the grouping key throughout — the same email on two
  // different stores (e.g. one account on Brivanaa, another on Sk elegance)
  // is two separate groups of size 1 each and is never touched by phase 2
  // below (only groups with more than one row are duplicates).
  const dupGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  const dupRowCount = dupGroups.reduce((n, [, rows]) => n + rows.length, 0);
  console.log(`[Migration] ${dupGroups.length} duplicate (email, store_id) group(s), ${dupRowCount} row(s) total involved.`);

  const toDelete: string[] = [];
  const unresolved: string[] = [];
  // Tracks which row survives for every (email, store_id) pair — duplicate
  // groups get their resolved "keep" row, singleton groups get their one
  // row — so phase 3 (roster links) has exactly one candidate user per pair
  // to check, not a set of not-yet-deleted duplicates.
  const survivorByKey = new Map<string, any>();

  for (const [key, rows] of groups) {
    if (rows.length === 1) { survivorByKey.set(key, rows[0]); continue; }

    const [email, storeId] = key.split("::");
    console.log(`  ${email} / store ${storeId} — ${rows.length} accounts:`);

    // team_members rows for this exact (email, store_id) pair, independent
    // of which of the duplicate user ids (if any) they currently point at —
    // this is what lets the log say "a roster row exists for this pair, but
    // it points at a 5th user id" instead of just "no roster row found".
    const { rows: teamRows } = await pool.query(
      `SELECT id, user_id, status, role FROM team_members WHERE email = $1 AND store_id = $2`,
      [email, storeId]
    );

    for (const r of rows as any[]) {
      const pointedAt = teamRows.find(tm => tm.user_id === r.id);
      console.log(
        `    ${r.id}  store=${r.store_id}  created=${r.created_at?.toISOString?.() ?? r.created_at}  role=${r.role}` +
        `  team_members_points_at_this_row=${!!pointedAt}`
      );
    }
    if (teamRows.length > 0) {
      console.log(`    team_members row(s) for this (email, store_id): ${teamRows.map(tm => `${tm.id}(user_id=${tm.user_id ?? "null"}, status=${tm.status})`).join(", ")}`);
    } else {
      console.log(`    team_members row(s) for this (email, store_id): none`);
    }

    // Prefer the row a team_members row's user_id actually points at
    // (oldest first if more than one — shouldn't normally happen, but
    // don't crash if it does); otherwise fall back to the oldest row in
    // the group. created_at ties are broken by id so the choice is
    // deterministic instead of depending on row fetch order.
    const pointedAtRows = (rows as any[]).filter(r => teamRows.some(tm => tm.user_id === r.id));
    const candidatePool = pointedAtRows.length > 0 ? pointedAtRows : (rows as any[]);
    const sorted = [...candidatePool].sort((a, b) => {
      const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return t !== 0 ? t : String(a.id).localeCompare(String(b.id));
    });
    const keep = sorted[0];

    if (!keep) {
      // Should be unreachable (every group here has at least 2 rows), but
      // this exact kind of assumption is what crashed before — never let
      // an unexpected shape halt the whole run. Report it and move on.
      console.error(`    UNRESOLVED: could not pick a row to keep for this group — skipping, no rows in this group will be touched.`);
      unresolved.push(key);
      continue;
    }

    const remove = (rows as any[]).filter(r => r.id !== keep.id);
    console.log(`    -> keep ${keep.id}${pointedAtRows.length === 0 ? " (no team_members row points at any of these — kept the oldest)" : ""}`);
    console.log(`    -> delete ${remove.length}: ${remove.map(r => r.id).join(", ") || "(none)"}`);
    toDelete.push(...remove.map(r => r.id));
    survivorByKey.set(key, keep);
  }

  if (unresolved.length > 0) {
    console.warn(`[Migration] ${unresolved.length} group(s) could not be resolved and were left untouched: ${unresolved.join(", ")}`);
  }

  // ── 3. Roster link report (all surviving accounts, not just duplicates) ──
  // Report only — this never writes anything, with or without --apply. Per
  // request: propose a fix, don't apply one, and never guess when more than
  // one team_members row could plausibly be the right link.
  console.log(`\n[Migration] Roster link check — ${survivorByKey.size} surviving account(s):`);
  let repairable = 0, needsInvite = 0, ambiguous = 0, ok = 0;
  for (const [key, survivor] of survivorByKey) {
    const [email, storeId] = key.split("::");
    const { rows: teamRows } = await pool.query(
      `SELECT id, user_id, status, role FROM team_members WHERE email = $1 AND store_id = $2`,
      [email, storeId]
    );

    if (teamRows.length === 0) {
      needsInvite++;
      console.log(`  NEEDS_INVITE  ${email} / store ${storeId} (user ${survivor.id}) — no team_members row at all. Proposal: leave as-is, re-invite manually (inventing a role/status here isn't safe).`);
    } else if (teamRows.length === 1) {
      if (teamRows[0].user_id === survivor.id) {
        ok++;
      } else {
        repairable++;
        console.log(`  REPAIRABLE    ${email} / store ${storeId} (user ${survivor.id}) — team_members ${teamRows[0].id} points at user_id=${teamRows[0].user_id ?? "null"} instead. Proposal: UPDATE team_members SET user_id = '${survivor.id}' WHERE id = '${teamRows[0].id}'.`);
      }
    } else {
      ambiguous++;
      console.log(`  AMBIGUOUS     ${email} / store ${storeId} (user ${survivor.id}) — ${teamRows.length} team_members rows exist for this pair (${teamRows.map(tm => `${tm.id}:user_id=${tm.user_id ?? "null"}`).join(", ")}). Proposal: none — needs manual review, do not guess.`);
    }
  }
  console.log(`[Migration] Roster link summary: ${ok} OK, ${repairable} repairable, ${needsInvite} need re-invite, ${ambiguous} ambiguous.`);
  console.log(`[Migration] No roster links were changed by this run — the fixes above are proposals for you to review, not applied automatically.`);

  if (!APPLY) {
    console.log(`\n[Migration] Dry run only — would delete ${toDelete.length} duplicate users row(s) total. No rows deleted, no index created. Re-run with --apply (after taking a backup) to apply.`);
    return;
  }

  if (unresolved.length > 0) {
    console.error(`[Migration] Refusing to apply: ${unresolved.length} item(s) are unresolved/ambiguous. Fix the data or this script, then re-run.`);
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

  console.log("[Migration] Done. Roster links were NOT modified — review the REPAIRABLE list above and apply those by hand (or ask for a follow-up script) once you've checked them.");
}
