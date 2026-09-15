/**
 * Accounts & Password Reset — DB Migration
 * Run: pnpm --filter @workspace/scripts exec tsx ./src/migrate-accounts-and-reset.ts
 *
 * 1. Drops the unique constraint on users.email (one email can now own
 *    several accounts — own store + invited stores) and replaces it with a
 *    plain index for lookup speed. The constraint name isn't hardcoded —
 *    drizzle-kit push named it whatever its own convention produced, so
 *    this looks it up from pg_constraint instead of guessing.
 * 2. Creates password_reset_tokens.
 */
import { pool } from "@workspace/db";

(async () => {
  console.log("[Migration] Starting accounts & password-reset schema migration...");

  try {
    const { rows } = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'users'::regclass AND contype = 'u'
        AND conkey = (
          SELECT array_agg(attnum ORDER BY attnum)
          FROM pg_attribute
          WHERE attrelid = 'users'::regclass AND attname = 'email'
        )
    `);
    if (rows.length === 0) {
      console.log("[Migration] OK: no unique constraint on users.email — already dropped");
    } else {
      for (const { conname } of rows) {
        await pool.query(`ALTER TABLE users DROP CONSTRAINT "${conname}"`);
        console.log("[Migration] OK: dropped unique constraint", conname);
      }
    }
  } catch (err: any) {
    console.error("[Migration] FAIL: dropping users.email unique constraint:", err.message);
  }

  const migrations = [
    `CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens (user_id)`,
  ];

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
