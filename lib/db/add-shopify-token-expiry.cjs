// One-off: add expiring-offline-token columns to stores and
// shopify_pending_installs. Guarded so re-running is a no-op. Safe to
// delete after it has been applied to every environment.
//
// Needed because Shopify now rejects non-expiring offline token issuance
// for this app (403 "Non-expiring access tokens are no longer accepted");
// new installs request `expiring: 1` and get back a refresh_token + expiry
// that we now have somewhere to store. See
// artifacts/api-server/src/lib/shopify-token.ts for how these are used.
const { Pool } = require("pg");
const p = new Pool({ connectionString: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL });

(async () => {
  await p.query(`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS shopify_refresh_token TEXT,
      ADD COLUMN IF NOT EXISTS shopify_token_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS shopify_refresh_token_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS shopify_needs_reconnect BOOLEAN NOT NULL DEFAULT false
  `);

  await p.query(`
    ALTER TABLE shopify_pending_installs
      ADD COLUMN IF NOT EXISTS refresh_token TEXT,
      ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMP
  `);

  console.log("OK: shopify token-expiry columns present on stores and shopify_pending_installs.");
  await p.end();
})().catch(e => { console.error("ERR", e.message); process.exit(1); });
