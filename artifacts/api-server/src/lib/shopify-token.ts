// Single chokepoint for "give me a Shopify access token I can use right
// now" — every Admin API call (products, orders, webhooks, order updates)
// should go through ensureFreshShopifyToken() (or shopifyFetch() in
// routes/shopify.ts, which calls it) instead of reading stores.shopify_access_token
// directly. That's what makes proactive refresh, single-flight locking, and
// the needs-reconnect flag apply everywhere instead of being patched in per
// call site.
//
// Expiring offline tokens (Shopify's post-2024 token-exchange rules) come
// with a refresh_token that itself expires after ~90 days of the store being
// idle. A non-expiring legacy token (e.g. SK Elegance's, issued before this
// app requested `expiring: 1`) has token_expires_at = NULL and is returned
// as-is forever — there is nothing to refresh.
import { pool } from "@workspace/db";

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";
const SHOPIFY_LEGACY_API_KEY = process.env.SHOPIFY_LEGACY_API_KEY || "";
const SHOPIFY_LEGACY_API_SECRET = process.env.SHOPIFY_LEGACY_API_SECRET || "";

// Refresh once the access token is within this much of expiring, rather than
// waiting for it to actually fail — an in-flight Admin API call started just
// before expiry should never race the clock.
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Thrown when a store has no usable token and can't get one (refresh token
// expired, or Shopify's refresh grant came back with a terminal 401) — the
// route handler is expected to catch this and respond distinctly from a
// generic 500, since the fix is "reconnect Shopify", not "retry".
export class ShopifyReauthRequiredError extends Error {
  constructor(public readonly storeId: string) {
    super(`Store ${storeId} needs to reconnect Shopify`);
    this.name = "ShopifyReauthRequiredError";
  }
}

interface StoreTokenRow {
  shopify_shop: string | null;
  shopify_access_token: string | null;
  shopify_refresh_token: string | null;
  shopify_token_expires_at: Date | null;
  shopify_refresh_token_expires_at: Date | null;
  shopify_app_client_id: string | null;
  shopify_needs_reconnect: boolean;
}

function credentialsFor(clientId: string | null): { clientId: string; secret: string } {
  // A store not owned by the legacy app (the common case, and the only case
  // going forward) uses the primary slot. Only a store explicitly recorded
  // as the legacy app's uses the legacy secret — matching how
  // verifyShopifyWebhookHmac/appOwnsStore already key off this column.
  if (clientId && clientId === SHOPIFY_LEGACY_API_KEY) {
    return { clientId: SHOPIFY_LEGACY_API_KEY, secret: SHOPIFY_LEGACY_API_SECRET };
  }
  return { clientId: SHOPIFY_API_KEY, secret: SHOPIFY_API_SECRET };
}

// One in-flight refresh per store at a time. Every refresh rotates BOTH the
// access_token and the refresh_token, so a second concurrent refresh using
// the now-retired refresh_token would come back 401 and disconnect the
// store. Concurrent callers await the same promise instead of each starting
// their own refresh.
//
// This is safe only because the API server runs as a single Railway
// instance today (no numReplicas set in artifacts/api-server/railway.toml,
// no Redis/shared-lock dependency anywhere in this codebase). If this
// service is ever scaled to multiple instances, this in-process Map stops
// being a real lock and needs to move to a DB-backed lock (e.g. a
// SELECT ... FOR UPDATE on the store row, or an advisory lock) instead.
const refreshLocks = new Map<string, Promise<string | null>>();

async function markNeedsReconnect(storeId: string): Promise<void> {
  await pool.query(
    `UPDATE stores SET shopify_needs_reconnect = true, updated_at = NOW() WHERE id = $1`,
    [storeId]
  );
}

// Calls Shopify's refresh grant and persists the rotated tokens. Returns the
// new access token, or null if the refresh token itself is dead (in which
// case the store is marked shopify_needs_reconnect for GET /status to
// surface). Never throws for the expected terminal case — only for
// unexpected network/response-shape failures, which callers should treat as
// transient (don't mark needs_reconnect, just fail this one call).
async function performRefresh(storeId: string, row: StoreTokenRow): Promise<string | null> {
  const { shop, refreshToken } = { shop: row.shopify_shop, refreshToken: row.shopify_refresh_token };
  if (!shop || !refreshToken) {
    await markNeedsReconnect(storeId);
    return null;
  }

  const { clientId, secret } = credentialsFor(row.shopify_app_client_id);
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: secret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (res.status === 401) {
    // Terminal per Shopify's docs: covers expired, already-rotated, revoked,
    // or unknown refresh tokens alike. Don't branch on which — require
    // reconnection either way rather than retrying in a loop.
    console.error(`[Shopify] Refresh token rejected (401) for store ${storeId} (${shop}) — marking needs_reconnect`);
    await markNeedsReconnect(storeId);
    return null;
  }

  if (!res.ok) {
    console.error(`[Shopify] Token refresh failed for store ${storeId} (${shop}): ${res.status} ${await res.text().catch(() => "")}`);
    return null;
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };
  if (!data.access_token) return null;

  const tokenExpiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;
  // Shopify's docs don't show refresh_token_expires_in being repeated on
  // every refresh response (only documented at initial issuance). If it's
  // absent, assume the documented default (90 days) rather than leaving the
  // old expiry in place, since the refresh_token itself was just rotated.
  const refreshTokenExpiresAt = new Date(Date.now() + (data.refresh_token_expires_in ?? 7_776_000) * 1000);

  await pool.query(
    `UPDATE stores SET
       shopify_access_token = $1,
       shopify_refresh_token = $2,
       shopify_token_expires_at = $3,
       shopify_refresh_token_expires_at = $4,
       shopify_needs_reconnect = false,
       updated_at = NOW()
     WHERE id = $5`,
    [data.access_token, data.refresh_token || refreshToken, tokenExpiresAt, refreshTokenExpiresAt, storeId]
  );

  console.log(`[Shopify] Refreshed access token for store ${storeId} (${shop}), expires ${tokenExpiresAt?.toISOString()}`);
  return data.access_token;
}

function needsRefresh(row: StoreTokenRow): boolean {
  if (!row.shopify_token_expires_at) return false; // non-expiring token
  return row.shopify_token_expires_at.getTime() - Date.now() <= REFRESH_BUFFER_MS;
}

// Returns { shop, accessToken } for a store's live Shopify connection,
// refreshing proactively first if the stored token is within
// REFRESH_BUFFER_MS of expiring. Returns null if the store isn't connected,
// or if reconnection is required (refresh token dead) — callers making an
// Admin API call should throw ShopifyReauthRequiredError in that case;
// GET /api/shopify/status reads shopify_needs_reconnect directly instead.
export async function ensureFreshShopifyToken(
  storeId: string,
  opts: { forceRefresh?: boolean } = {}
): Promise<{ shop: string; accessToken: string } | null> {
  const { rows } = await pool.query<StoreTokenRow>(
    `SELECT shopify_shop, shopify_access_token, shopify_refresh_token,
            shopify_token_expires_at, shopify_refresh_token_expires_at,
            shopify_app_client_id, shopify_needs_reconnect
     FROM stores WHERE id = $1 LIMIT 1`,
    [storeId]
  );
  const row = rows[0];
  if (!row?.shopify_shop || !row.shopify_access_token) return null;
  if (row.shopify_needs_reconnect) return null;

  if (!opts.forceRefresh && !needsRefresh(row)) {
    return { shop: row.shopify_shop, accessToken: row.shopify_access_token };
  }

  // Refresh token already known to be past its own expiry — no point
  // calling Shopify, go straight to needs_reconnect.
  if (row.shopify_refresh_token_expires_at && row.shopify_refresh_token_expires_at.getTime() <= Date.now()) {
    console.error(`[Shopify] Refresh token expired for store ${storeId} (${row.shopify_shop}) — marking needs_reconnect`);
    await markNeedsReconnect(storeId);
    return null;
  }

  // A non-expiring token (shopify_token_expires_at NULL) never reaches here
  // unless forceRefresh was requested after a surprise 401 — in that case
  // there's no refresh_token to use at all, so just report not-connected.
  if (!row.shopify_refresh_token) return null;

  let refreshPromise = refreshLocks.get(storeId);
  if (!refreshPromise) {
    refreshPromise = performRefresh(storeId, row).finally(() => {
      refreshLocks.delete(storeId);
    });
    refreshLocks.set(storeId, refreshPromise);
  }

  const accessToken = await refreshPromise;
  if (!accessToken) return null;
  return { shop: row.shopify_shop, accessToken };
}

// Shared helper for the OAuth code exchange in /callback and the pending
// no_store branch — a small aid to read the same field names consistently.
export function tokenExpiryFields(data: { expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number }) {
  return {
    tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    refreshToken: data.refresh_token || null,
    refreshTokenExpiresAt: data.refresh_token && data.refresh_token_expires_in
      ? new Date(Date.now() + data.refresh_token_expires_in * 1000)
      : null,
  };
}

export { credentialsFor as shopifyCredentialsForClientId, REFRESH_BUFFER_MS };
