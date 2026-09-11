import { Router } from "express";
import { db, pool, storesTable, productsTable, ordersTable, orderItemsTable, customersTable, auditLogsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import crypto from "crypto";

const router = Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";
// Legacy slot: FLychatcod's credentials, kept alongside the primary (public
// app) slot during the migration so its stores' webhooks keep verifying.
// Both OAuth (oauth/start, callback) and new installs use the primary slot
// only — the legacy slot exists purely so verifyShopifyWebhookHmac can still
// recognize FLychatcod's HMACs for shops that installed before the switch.
const SHOPIFY_LEGACY_API_KEY = process.env.SHOPIFY_LEGACY_API_KEY || "";
const SHOPIFY_LEGACY_API_SECRET = process.env.SHOPIFY_LEGACY_API_SECRET || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://flychatcodstore-production-a2e8.up.railway.app";
const API_BASE_URL = process.env.API_BASE_URL || "https://zealous-nature-production-771f.up.railway.app";

const SCOPES = "read_products,write_orders,read_orders,read_customers";
const SHOP_DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
// How old a shop-initiated install launch's `timestamp` param may be before
// it's rejected as stale. Shopify itself doesn't enforce a window here, but
// bounding it keeps a captured install URL from being replayable indefinitely.
const INSTALL_TIMESTAMP_MAX_AGE_SECONDS = 300;

// Same secret lib/auth.ts uses to sign FlyChat's own session tokens (and the
// same fallback, so behavior is identical whether or not it's set) — reused
// here rather than adding a new env var, matching how instagram.ts/messenger.ts
// already reuse it for their own signed tokens.
const JWT_SECRET = process.env.JWT_SECRET || "flychat-dev-secret-change-in-prod";

// ─── Helper: signed OAuth state ────────────────────────────────────────────────
// Previously `state` was just base64(JSON) with no signature — anyone who
// could get their own "code"+"hmac" out of Shopify for a shop they control
// could forge a state naming an arbitrary storeId and hijack that store's
// Shopify connection in /callback. Signing it (HMAC-SHA256 over the payload,
// with a random nonce + expiry) makes it unforgeable and unreplayable outside
// its window. storeId is included only when the flow started from an
// authenticated FlyChat session (/oauth/start); /install below omits it.
function signOAuthState(payload: { storeId?: string }, ttlSeconds: number): string {
  const body = { ...payload, nonce: crypto.randomBytes(16).toString("hex"), exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyOAuthState(state: string): { storeId?: string } | null {
  try {
    const [encoded, sig] = state.split(".");
    if (!encoded || !sig) return null;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(encoded).digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ─── Helper: verify Shopify's install/callback query-param HMAC ──────────────
// Shared by /install (launch) and /callback (redirect back): both send a set
// of query params signed the same way — sort every param except hmac, join as
// k=v pairs with &, hex HMAC-SHA256 with the app secret. Always the primary
// app's secret: both routes only ever run against SHOPIFY_API_KEY/SECRET.
function verifyShopifyInstallHmac(query: Record<string, string>): boolean {
  const hmac = query.hmac;
  if (!hmac || !SHOPIFY_API_SECRET) return false;
  const params = { ...query };
  delete params.hmac;
  delete params.signature;
  const message = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  const digest = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(message).digest("hex");
  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── Helper: Shopify API call ─────────────────────────────────────────────────
async function shopifyFetch(shop: string, accessToken: string, endpoint: string, options: RequestInit = {}) {
  const url = `https://${shop}/admin/api/2024-01${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ─── GET /api/shopify/status ──────────────────────────────────────────────────
router.get("/status", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ connected: false }); return; }

    const { rows } = await pool.query(
      `SELECT shopify_shop, shopify_scope, shopify_synced_at FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    const row = rows[0];
    res.json({
      connected: !!row?.shopify_shop,
      shop: row?.shopify_shop || null,
      scope: row?.shopify_scope || null,
      syncedAt: row?.shopify_synced_at || null,
    });
  } catch (err) {
    console.error("[Shopify] Status error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /api/shopify/oauth/start ────────────────────────────────────────────
router.get("/oauth/start", requireAuth, async (req, res) => {
  const { shop } = req.query as Record<string, string>;

  if (!shop) { res.status(400).json({ error: "shop parameter required" }); return; }

  // Validate shop domain
  if (!SHOP_DOMAIN_RE.test(shop)) {
    res.status(400).json({ error: "Invalid shop domain" });
    return;
  }

  const storeId = req.user!.storeId || "";
  const state = signOAuthState({ storeId }, 10 * 60);

  const authUrl = `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: `${API_BASE_URL}/api/shopify/callback`,
    state,
  });

  res.json({ url: authUrl });
});

// ─── GET /api/shopify/install ─────────────────────────────────────────────────
// Entry point for an install launched from Shopify itself (App Store "Install",
// or opening the app from a shop's admin) rather than FlyChat's own Connect
// Shopify button — so there's no logged-in FlyChat session yet. Shopify hits
// this URL (it's application_url in shopify.app.public.toml) with
// ?shop=&hmac=&timestamp=. Verifies both, then redirects straight to the
// OAuth grant screen — the review requirement 1.2 flagged as missing.
// Primary app only: this route always uses SHOPIFY_API_KEY/SECRET, never the
// legacy slot, matching how /oauth/start and /callback already work.
router.get("/install", async (req, res) => {
  const { shop, timestamp } = req.query as Record<string, string>;

  if (!shop || !timestamp) { res.status(400).json({ error: "shop and timestamp parameters required" }); return; }

  if (!SHOP_DOMAIN_RE.test(shop)) { res.status(400).json({ error: "Invalid shop domain" }); return; }

  if (!verifyShopifyInstallHmac(req.query as Record<string, string>)) {
    res.status(401).json({ error: "Invalid HMAC" });
    return;
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > INSTALL_TIMESTAMP_MAX_AGE_SECONDS) {
    res.status(401).json({ error: "Stale timestamp" });
    return;
  }

  // No storeId: there's no FlyChat session to attach this to yet. /callback
  // handles that (existing store reconnecting vs. brand-new install) — B.3.
  const state = signOAuthState({}, 10 * 60);

  const authUrl = `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: `${API_BASE_URL}/api/shopify/callback`,
    state,
  });

  res.redirect(authUrl);
});

// ─── GET /api/shopify/callback ────────────────────────────────────────────────
router.get("/callback", async (req, res) => {
  try {
    const { shop, code, state, hmac } = req.query as Record<string, string>;

    if (!shop || !code || !state) {
      res.redirect(`${APP_BASE_URL}/channels?error=shopify_missing_params`);
      return;
    }

    // Verify HMAC
    if (!verifyShopifyInstallHmac(req.query as Record<string, string>)) {
      res.redirect(`${APP_BASE_URL}/channels?error=shopify_invalid_hmac`);
      return;
    }

    // Verify state: signed, so it can't be forged into naming a different
    // storeId, and it expires (see signOAuthState / verifyOAuthState above).
    const statePayload = verifyOAuthState(state);
    if (!statePayload) {
      res.redirect(`${APP_BASE_URL}/channels?error=shopify_invalid_state`);
      return;
    }

    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: SHOPIFY_API_KEY, client_secret: SHOPIFY_API_SECRET, code }),
    });
    const tokenData = await tokenRes.json() as { access_token: string; scope: string };

    if (!tokenData.access_token) {
      res.redirect(`${APP_BASE_URL}/channels?error=shopify_token_failed`);
      return;
    }

    const { storeId } = statePayload;
    if (!storeId) {
      // No storeId means this came from a shop-initiated install
      // (GET /install), not an authenticated /oauth/start — see B.3.
      res.redirect(`${APP_BASE_URL}/channels?error=shopify_missing_params`);
      return;
    }

    // Save to store. New installs always go through the primary app
    // (SHOPIFY_API_KEY) — recording it lets the GDPR handlers above tell
    // this store apart from one still owned by the legacy app.
    await pool.query(
      `UPDATE stores SET shopify_shop = $1, shopify_access_token = $2, shopify_scope = $3, shopify_app_client_id = $4, updated_at = NOW() WHERE id = $5`,
      [shop, tokenData.access_token, tokenData.scope, SHOPIFY_API_KEY, storeId]
    );

    console.log(`[Shopify] Connected shop ${shop} for store ${storeId}`);

    // Register webhooks
    await registerWebhooks(shop, tokenData.access_token, storeId);

    // Initial product sync
    await syncProducts(storeId, shop, tokenData.access_token);

    res.redirect(`${APP_BASE_URL}/channels?success=shopify_connected`);
  } catch (err) {
    console.error("[Shopify] Callback error:", err);
    res.redirect(`${APP_BASE_URL}/channels?error=shopify_callback_failed`);
  }
});

// ─── POST /api/shopify/disconnect ─────────────────────────────────────────────
router.post("/disconnect", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    await pool.query(
      `UPDATE stores SET shopify_shop = NULL, shopify_access_token = NULL, shopify_scope = NULL, shopify_app_client_id = NULL WHERE id = $1`,
      [storeId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[Shopify] Disconnect error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /api/shopify/sync/products ─────────────────────────────────────────
router.post("/sync/products", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { rows } = await pool.query(
      `SELECT shopify_shop, shopify_access_token FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    if (!rows[0]?.shopify_shop) {
      res.status(400).json({ error: "not_connected", message: "Shopify not connected" });
      return;
    }

    const count = await syncProducts(storeId, rows[0].shopify_shop, rows[0].shopify_access_token);
    res.json({ success: true, synced: count });
  } catch (err: any) {
    console.error("[Shopify] Sync products error:", err);
    res.status(500).json({ error: "sync_failed", message: err.message });
  }
});

// ─── POST /api/shopify/sync/orders ───────────────────────────────────────────
router.post("/sync/orders", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { rows } = await pool.query(
      `SELECT shopify_shop, shopify_access_token FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    if (!rows[0]?.shopify_shop) {
      res.status(400).json({ error: "not_connected", message: "Shopify not connected" });
      return;
    }

    const count = await syncOrders(storeId, rows[0].shopify_shop, rows[0].shopify_access_token);
    console.log("[Shopify] Sync orders result:", JSON.stringify({ synced: count }));
    res.json({ success: true, synced: count });
  } catch (err: any) {
    console.error("[Shopify] Sync orders error:", err);
    res.status(500).json({ error: "sync_failed", message: err.message });
  }
});

// ─── POST /api/shopify/register-webhooks ─────────────────────────────────────
// Re-register this shop's Admin API webhook subscriptions without a full
// disconnect/reconnect. Useful when API_BASE_URL changed, a subscription was
// deleted in Shopify, or a store connected before a topic was added here.
// Registration is idempotent per (topic, address): Shopify rejects an exact
// duplicate, which registerWebhooks logs and skips.
router.post("/register-webhooks", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { rows } = await pool.query(
      `SELECT shopify_shop, shopify_access_token FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    const store = rows[0];

    if (!store?.shopify_shop || !store?.shopify_access_token) {
      res.status(400).json({ error: "not_connected", message: "Shopify not connected for this store" });
      return;
    }

    const result = await registerWebhooks(store.shopify_shop, store.shopify_access_token, storeId);

    res.json({
      success: true,
      message: `Webhooks registered for ${store.shopify_shop}`,
      shop: store.shopify_shop,
      registered: result.registered,
      failed: result.failed,
      // Compliance topics can't be registered per-shop via the Admin API —
      // they're app-level config. Returned so the URLs are easy to copy into
      // Partner Dashboard → App setup → Compliance webhooks.
      complianceWebhooks: {
        note: "Configure these once in the Partner Dashboard (app-level, not per shop).",
        urls: COMPLIANCE_WEBHOOK_URLS,
      },
    });
  } catch (err: any) {
    console.error("[Shopify] Register webhooks error:", err);
    res.status(500).json({ error: "register_failed", message: err.message });
  }
});

// ─── POST /api/shopify/webhook ────────────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  try {
    const shop = req.headers["x-shopify-shop-domain"] as string;
    const topic = req.headers["x-shopify-topic"] as string;

    // Verify webhook over the raw signed bytes (see verifyShopifyWebhookHmac).
    if (!verifyShopifyWebhookHmac(req)) {
      res.status(401).send("Unauthorized");
      return;
    }

    const payload = parseWebhookBody(req);

    const { rows } = await pool.query(
      `SELECT id FROM stores WHERE shopify_shop = $1 LIMIT 1`,
      [shop]
    );
    const storeId = rows[0]?.id;
    if (!storeId) { res.json({ received: true }); return; }

    if (topic === "orders/create") {
      await handleShopifyOrderWebhook(storeId, payload);
    } else if (topic === "products/update" || topic === "products/create") {
      await handleShopifyProductWebhook(storeId, payload);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[Shopify] Webhook error:", err);
    res.json({ received: true });
  }
});

// ─── Shopify mandatory GDPR webhooks ───────────────────────────────────────────
// Required for Shopify App Store approval (App setup → GDPR mandatory webhooks).
// Each must verify HMAC, always ACK 200 quickly, and log the request for
// compliance record-keeping — matching the same HMAC scheme the existing
// /webhook endpoint above already uses.
// Webhook routes are mounted with express.raw() in app.ts, so req.body is the
// exact Buffer Shopify signed. Digest that Buffer directly — re-serializing via
// JSON.stringify would change the bytes and never match.
//
// Tries the primary (public app) secret first, then the legacy (FLychatcod)
// secret, and returns whichever app's client_id produced a matching digest —
// or null if neither did (still a 401 at the call site either way). If the
// legacy slot is unset, or holds the same secret as primary, it's just a
// no-op second check — safe either way.
function verifyShopifyWebhookHmac(req: import("express").Request): string | null {
  const hmac = req.headers["x-shopify-hmac-sha256"] as string | undefined;
  if (!hmac) return null;

  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
  const b = Buffer.from(hmac, "utf8");

  const candidates: [string, string][] = [
    [SHOPIFY_API_KEY, SHOPIFY_API_SECRET],
    [SHOPIFY_LEGACY_API_KEY, SHOPIFY_LEGACY_API_SECRET],
  ];

  for (const [clientId, secret] of candidates) {
    if (!secret) continue;
    const digest = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    // timingSafeEqual throws on length mismatch, so compare lengths first.
    const a = Buffer.from(digest, "utf8");
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return clientId || null;
  }
  return null;
}

// req.body is a Buffer on webhook routes — parse it once verification passed.
function parseWebhookBody(req: import("express").Request): any {
  if (!Buffer.isBuffer(req.body)) return req.body ?? {};
  try {
    return JSON.parse(req.body.toString("utf8"));
  } catch (err) {
    console.error("[Shopify] Failed to parse webhook body:", err);
    return {};
  }
}

async function logGdprRequest(topic: string, shop: string, payload: unknown): Promise<void> {
  console.log(`[Shopify GDPR] ${topic} for shop ${shop}:`, JSON.stringify(payload));
  try {
    const { rows } = await pool.query(`SELECT id FROM stores WHERE shopify_shop = $1 LIMIT 1`, [shop]);
    await db.insert(auditLogsTable).values({
      id: generateId("audit"),
      storeId: rows[0]?.id || null,
      userId: null,
      event: `gdpr_${topic}`,
      description: `Shopify GDPR webhook received: ${topic} for shop ${shop}`,
      metadata: payload as Record<string, unknown>,
    });
  } catch (err) {
    console.error(`[Shopify GDPR] Failed to log ${topic}:`, err);
  }
}

// A store whose shopify_app_client_id isn't set yet (not backfilled, or
// connected before the two-app split) is treated as unowned — allow the
// action rather than silently block it. Once set, only the app that owns
// the store may act on it; this is what stops FLychatcod's compliance
// webhooks from redacting a store that has since moved to the public app,
// and vice versa.
function appOwnsStore(storeClientId: string | null | undefined, matchedClientId: string): boolean {
  return !storeClientId || storeClientId === matchedClientId;
}

// GDPR: a customer asked the merchant for the data FlyChat holds about them.
// FlyChat has no automated export flow yet — acknowledge receipt and log it
// so a human can compile and send the data within Shopify's required window.
// Not gated by shopify_app_client_id: it only reads/logs, never changes data.
router.post("/webhooks/customers/data_request", async (req, res) => {
  const shop = req.headers["x-shopify-shop-domain"] as string;
  if (!verifyShopifyWebhookHmac(req)) { res.status(401).send("Unauthorized"); return; }
  await logGdprRequest("customers/data_request", shop, parseWebhookBody(req));
  res.status(200).json({ received: true });
});

// GDPR: a specific customer asked to be redacted. Scrub identifying fields
// on their customer record and any orders linked to them; order/financial
// history is kept (order numbers, totals, items) but no longer identifies them.
router.post("/webhooks/customers/redact", async (req, res) => {
  const shop = req.headers["x-shopify-shop-domain"] as string;
  const matchedClientId = verifyShopifyWebhookHmac(req);
  if (!matchedClientId) { res.status(401).send("Unauthorized"); return; }
  const payload = parseWebhookBody(req);
  await logGdprRequest("customers/redact", shop, payload);
  res.status(200).json({ received: true });

  try {
    const { rows: storeRows } = await pool.query(
      `SELECT id, shopify_app_client_id FROM stores WHERE shopify_shop = $1 LIMIT 1`,
      [shop]
    );
    const storeId = storeRows[0]?.id;
    if (!storeId) return;
    if (!appOwnsStore(storeRows[0]?.shopify_app_client_id, matchedClientId)) {
      console.log(
        `[Shopify GDPR] Skipping customers/redact for store ${storeId}: verified app ${matchedClientId} ` +
        `does not own this store (owner: ${storeRows[0]?.shopify_app_client_id})`
      );
      return;
    }

    const email: string | null = payload?.customer?.email || null;
    const phone: string | null = payload?.customer?.phone || null;
    if (!email && !phone) return;

    const { rows: custRows } = await pool.query(
      `SELECT id FROM customers WHERE store_id = $1 AND ((email = $2 AND $2 IS NOT NULL) OR (phone = $3 AND $3 IS NOT NULL))`,
      [storeId, email, phone]
    );
    for (const c of custRows) {
      await pool.query(
        `UPDATE customers SET name = 'Redacted Customer', phone = NULL, email = NULL, updated_at = NOW() WHERE id = $1`,
        [c.id]
      );
      await pool.query(
        `UPDATE orders SET customer_name = 'Redacted Customer', customer_phone = NULL, customer_email = NULL, address = NULL, updated_at = NOW() WHERE customer_id = $1`,
        [c.id]
      );
    }
    console.log(`[Shopify GDPR] Redacted ${custRows.length} customer record(s) for shop ${shop}`);
  } catch (err) {
    console.error("[Shopify GDPR] customers/redact processing error:", err);
  }
});

// GDPR: sent ~48h after a merchant uninstalls FlyChat — scrub all customer
// PII for that shop. Orders/products are kept (business records) with
// identifying customer info removed.
router.post("/webhooks/shop/redact", async (req, res) => {
  const shop = req.headers["x-shopify-shop-domain"] as string;
  const matchedClientId = verifyShopifyWebhookHmac(req);
  if (!matchedClientId) { res.status(401).send("Unauthorized"); return; }
  await logGdprRequest("shop/redact", shop, parseWebhookBody(req));
  res.status(200).json({ received: true });

  try {
    const { rows: storeRows } = await pool.query(
      `SELECT id, shopify_app_client_id FROM stores WHERE shopify_shop = $1 LIMIT 1`,
      [shop]
    );
    const storeId = storeRows[0]?.id;
    if (!storeId) return;
    if (!appOwnsStore(storeRows[0]?.shopify_app_client_id, matchedClientId)) {
      console.log(
        `[Shopify GDPR] Skipping shop/redact for store ${storeId}: verified app ${matchedClientId} ` +
        `does not own this store (owner: ${storeRows[0]?.shopify_app_client_id})`
      );
      return;
    }

    await pool.query(
      `UPDATE customers SET name = 'Redacted Customer', phone = NULL, email = NULL, updated_at = NOW() WHERE store_id = $1`,
      [storeId]
    );
    await pool.query(
      `UPDATE orders SET customer_name = 'Redacted Customer', customer_phone = NULL, customer_email = NULL, address = NULL, updated_at = NOW() WHERE store_id = $1 AND shopify_order_id IS NOT NULL`,
      [storeId]
    );
    console.log(`[Shopify GDPR] Redacted shop data for ${shop} (store ${storeId})`);
  } catch (err) {
    console.error("[Shopify GDPR] shop/redact processing error:", err);
  }
});

// ─── Helper: sync products ────────────────────────────────────────────────────
async function syncProducts(storeId: string, shop: string, accessToken: string): Promise<number> {
  let shopifyProducts: any[] = [];
  let url = "/products.json?limit=250&status=active";
  while (url) {
    const res = await shopifyFetch(shop, accessToken, url) as any;
    shopifyProducts = shopifyProducts.concat(res.products || []);
    // Shopify pagination via Link header — handled via next page_info
    const nextMatch = res.next_page_info ? `/products.json?limit=250&page_info=${res.next_page_info}` : null;
    url = nextMatch || "";
  }
  let count = 0;

  for (const sp of shopifyProducts) {
    const price = sp.variants?.[0]?.price || "0";
    const stock = sp.variants?.[0]?.inventory_quantity ?? null;
    const imageUrl = sp.image?.src || sp.images?.[0]?.src || null;
    const variants = sp.variants?.map((v: any) => v.title).filter((t: string) => t !== "Default Title") || [];

    // Check if product exists by shopify_product_id
    const { rows } = await pool.query(
      `SELECT id FROM products WHERE store_id = $1 AND shopify_product_id = $2 LIMIT 1`,
      [storeId, String(sp.id)]
    );

    if (rows[0]) {
      // Update existing
      await pool.query(
        `UPDATE products SET name = $1, description = $2, price = $3, stock = $4, image_url = $5, variants = $6, updated_at = NOW() WHERE id = $7`,
        [sp.title, sp.body_html?.replace(/<[^>]*>/g, "") || null, price, stock, imageUrl, JSON.stringify(variants), rows[0].id]
      );
    } else {
      // Insert new
      await pool.query(
        `INSERT INTO products (id, store_id, name, description, price, stock, image_url, variants, is_active, shopify_product_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW(), NOW())`,
        [generateId("prod"), storeId, sp.title, sp.body_html?.replace(/<[^>]*>/g, "") || null, price, stock, imageUrl, JSON.stringify(variants), String(sp.id)]
      );
    }
    count++;
  }

  await pool.query(
    `UPDATE stores SET shopify_synced_at = NOW() WHERE id = $1`,
    [storeId]
  );

  console.log(`[Shopify] Synced ${count} products for store ${storeId}`);
  return count;
}

// ─── Helper: sync existing orders ────────────────────────────────────────────
async function syncOrders(storeId: string, shop: string, accessToken: string): Promise<number> {
  // Ensure new columns exist (idempotent)
  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopify_order_number TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_status TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_channel TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '[]';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_status TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS tags TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
  `);

  let shopifyOrders: any[] = [];
  let url = "/orders.json?limit=250&status=any";
  while (url) {
    const res = await shopifyFetch(shop, accessToken, url) as any;
    shopifyOrders = shopifyOrders.concat(res.orders || []);
    url = res.next_page_info ? `/orders.json?limit=250&page_info=${res.next_page_info}` : "";
  }
  let count = 0;

  for (const so of shopifyOrders) {
    const shippingLine = so.shipping_lines?.[0];
    const customerName = `${so.customer?.first_name || ""} ${so.customer?.last_name || ""}`.trim() || "Unknown";
    const customerEmail = so.customer?.email || so.email || "";
    const customerPhone = so.customer?.phone || so.shipping_address?.phone || so.billing_address?.phone || "";
    const wilaya = so.shipping_address?.city || so.billing_address?.city || "";
    const address = [so.shipping_address?.address1, so.shipping_address?.address2].filter(Boolean).join(", ") || "";

    const shippingAddress = so.shipping_address ? {
      first_name: so.shipping_address.first_name || "",
      last_name: so.shipping_address.last_name || "",
      address1: so.shipping_address.address1 || "",
      address2: so.shipping_address.address2 || "",
      city: so.shipping_address.city || "",
      province: so.shipping_address.province || "",
      zip: so.shipping_address.zip || "",
      country: so.shipping_address.country || "",
      phone: so.shipping_address.phone || "",
    } : null;

    const flags: string[] = [];
    if (so.risks?.length > 0) flags.push(...so.risks.map((r: any) => r.message));
    if (so.financial_status === "voided") flags.push("voided");

    const sales_channel = so.source_name || (so.app_id ? String(so.app_id) : "") || "online_store";

    const delivery_status = so.fulfillments?.[0]?.shipment_status
      || so.fulfillment_status
      || "pending";

    const items = (so.line_items || []).map((item: any) => ({
      title: item.title,
      variant_title: item.variant_title || null,
      quantity: item.quantity,
      price: parseFloat(item.price),
      total: parseFloat(item.price) * item.quantity,
      sku: item.sku || null,
      product_id: item.product_id,
      variant_id: item.variant_id,
      image: item.image?.src || null,
      requires_shipping: item.requires_shipping,
    }));

    const { rows: existing } = await pool.query(
      `SELECT id FROM orders WHERE store_id = $1 AND shopify_order_id = $2 LIMIT 1`,
      [storeId, String(so.id)]
    );

    if (existing[0]) {
      // Update existing order with newly mapped fields
      await pool.query(
        `UPDATE orders SET
          shopify_order_number=$1, customer_email=$2,
          financial_status=$3, fulfillment_status=$4, delivery_status=$5,
          sales_channel=$6, flags=$7, tags=$8, items=$9,
          shipping_address=$10, updated_at=NOW()
         WHERE id=$11`,
        [
          so.name, customerEmail,
          so.financial_status, so.fulfillment_status || "unfulfilled", delivery_status,
          sales_channel, JSON.stringify(flags), so.tags || "", JSON.stringify(items),
          shippingAddress ? JSON.stringify(shippingAddress) : null,
          existing[0].id,
        ]
      );
    } else {
      const orderId = generateId("ord");
      await pool.query(
        `INSERT INTO orders (
          id, store_id, status, order_number, shopify_order_number,
          customer_name, customer_phone, customer_email,
          wilaya, address, shipping_address,
          total, is_cod,
          financial_status, fulfillment_status, delivery_status,
          sales_channel, flags, tags, items,
          shopify_order_id, created_by_source, shipping_option,
          created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16,$17,$18,$19,$20,'shopify',$21,$22,NOW())
         -- Backstop for the race between the SELECT above and this INSERT: an
         -- orders/create webhook can land mid-sync. The UPDATE branch above
         -- already handles the normal "already imported" case.
         ON CONFLICT (store_id, shopify_order_id) DO UPDATE SET
           financial_status = EXCLUDED.financial_status,
           fulfillment_status = EXCLUDED.fulfillment_status,
           delivery_status = EXCLUDED.delivery_status,
           flags = EXCLUDED.flags,
           tags = EXCLUDED.tags,
           items = EXCLUDED.items,
           updated_at = NOW()`,
        [
          orderId, storeId, mapShopifyStatus(so.financial_status), so.name, so.name,
          customerName, customerPhone, customerEmail,
          wilaya, address, shippingAddress ? JSON.stringify(shippingAddress) : null,
          so.total_price,
          so.financial_status, so.fulfillment_status || "unfulfilled", delivery_status,
          sales_channel, JSON.stringify(flags), so.tags || "", JSON.stringify(items),
          String(so.id), shippingLine?.title || null, new Date(so.created_at),
        ]
      );
    }

    count++;
  }

  await pool.query(`UPDATE stores SET shopify_synced_at = NOW() WHERE id = $1`, [storeId]);
  console.log(`[Shopify] Synced ${count} orders for store ${storeId}`);
  return count;
}

// ─── Helper: push order to Shopify ───────────────────────────────────────────
export async function pushOrderToShopify(storeId: string, orderId: string): Promise<string | null> {
  try {
    const { rows: storeRows } = await pool.query(
      `SELECT shopify_shop, shopify_access_token FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    if (!storeRows[0]?.shopify_shop) return null;

    const { rows: orderRows } = await pool.query(
      `SELECT o.*, array_agg(json_build_object('name', oi.product_name, 'price', oi.price, 'quantity', oi.quantity)) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 GROUP BY o.id LIMIT 1`,
      [orderId]
    );
    const order = orderRows[0];
    if (!order) return null;

    const shopifyOrder = {
      order: {
        line_items: order.items?.filter((i: any) => i.name).map((item: any) => ({
          title: item.name,
          price: String(item.price),
          quantity: item.quantity || 1,
        })) || [],
        customer: {
          first_name: order.customer_name?.split(" ")[0] || "",
          last_name: order.customer_name?.split(" ").slice(1).join(" ") || "",
          phone: order.customer_phone || "",
        },
        shipping_address: {
          first_name: order.customer_name?.split(" ")[0] || "",
          last_name: order.customer_name?.split(" ").slice(1).join(" ") || "",
          phone: order.customer_phone || "",
          city: order.wilaya || "",
          address1: order.address || "",
          country: "DZ",
          country_code: "DZ",
        },
        shipping_lines: [
          {
            title: order.shipping_option === "home_delivery" ? "الى البيت" : "من الفرع",
            price: String(order.shipping_fee ?? "0"),
            code: order.shipping_option ?? "home_delivery",
          },
        ],
        financial_status: "pending",
        payment_gateway: "cash_on_delivery",
        note: `COD Order from FlyChat COD. Wilaya: ${order.wilaya}`,
        tags: "flychat-cod,cod",
        send_receipt: false,
        send_fulfillment_receipt: false,
      },
    };

    const result = await shopifyFetch(
      storeRows[0].shopify_shop,
      storeRows[0].shopify_access_token,
      "/orders.json",
      { method: "POST", body: JSON.stringify(shopifyOrder) }
    ) as any;

    const shopifyOrderId = String(result.order?.id);
    if (shopifyOrderId) {
      await pool.query(
        `UPDATE orders SET shopify_order_id = $1, updated_at = NOW() WHERE id = $2`,
        [shopifyOrderId, orderId]
      );
      console.log(`[Shopify] Order ${orderId} pushed to Shopify as ${result.order?.name}`);
    }

    return shopifyOrderId || null;
  } catch (err) {
    console.error("[Shopify] Push order error:", err);
    return null;
  }
}

// ─── Helper: handle incoming Shopify order webhook ────────────────────────────
async function handleShopifyOrderWebhook(storeId: string, order: any): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id FROM orders WHERE store_id = $1 AND shopify_order_id = $2 LIMIT 1`,
    [storeId, String(order.id)]
  );
  if (rows[0]) return; // Already exists

  const orderId = generateId("ord");
  const customerName = `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim() || "Unknown";
  const customerEmail = order.customer?.email || order.email || "";
  const customerPhone = order.customer?.phone || order.shipping_address?.phone || order.billing_address?.phone || "";
  const wilaya = order.shipping_address?.city || "";
  const shippingLine = order.shipping_lines?.[0];

  const shippingAddress = order.shipping_address ? {
    address1: order.shipping_address.address1 || "",
    address2: order.shipping_address.address2 || "",
    city: order.shipping_address.city || "",
    province: order.shipping_address.province || "",
    zip: order.shipping_address.zip || "",
    country: order.shipping_address.country || "",
    phone: order.shipping_address.phone || "",
  } : null;

  const flags: string[] = [];
  if (order.risks?.length > 0) flags.push(...order.risks.map((r: any) => r.message));
  if (order.financial_status === "voided") flags.push("voided");

  const sales_channel = order.source_name || (order.app_id ? String(order.app_id) : "") || "online_store";
  const delivery_status = order.fulfillments?.[0]?.shipment_status || order.fulfillment_status || "pending";

  const items = (order.line_items || []).map((item: any) => ({
    title: item.title,
    variant_title: item.variant_title || null,
    quantity: item.quantity,
    price: parseFloat(item.price),
    total: parseFloat(item.price) * item.quantity,
    sku: item.sku || null,
    product_id: item.product_id,
    variant_id: item.variant_id,
    image: item.image?.src || null,
    requires_shipping: item.requires_shipping,
  }));

  await pool.query(
    `INSERT INTO orders (
      id, store_id, status, order_number, shopify_order_number,
      customer_name, customer_phone, customer_email,
      wilaya, address, shipping_address,
      total, is_cod,
      financial_status, fulfillment_status, delivery_status,
      sales_channel, flags, tags, items,
      shopify_order_id, created_by_source, shipping_option,
      created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16,$17,$18,$19,$20,'shopify',$21,NOW(),NOW())
     -- Backstop for the race between the SELECT above and this INSERT (webhook
     -- retries arrive concurrently). Refreshes status fields only: customer
     -- name/phone/email/address are left alone so a re-delivered webhook can't
     -- undo a GDPR redaction.
     ON CONFLICT (store_id, shopify_order_id) DO UPDATE SET
       financial_status = EXCLUDED.financial_status,
       fulfillment_status = EXCLUDED.fulfillment_status,
       delivery_status = EXCLUDED.delivery_status,
       flags = EXCLUDED.flags,
       tags = EXCLUDED.tags,
       items = EXCLUDED.items,
       updated_at = NOW()`,
    [
      orderId, storeId, mapShopifyStatus(order.financial_status), order.name, order.name,
      customerName, customerPhone, customerEmail,
      wilaya, order.shipping_address?.address1 || "", shippingAddress ? JSON.stringify(shippingAddress) : null,
      order.total_price,
      order.financial_status, order.fulfillment_status || "unfulfilled", delivery_status,
      sales_channel, JSON.stringify(flags), order.tags || "", JSON.stringify(items),
      String(order.id), shippingLine?.title || null,
    ]
  );

  console.log(`[Shopify] Webhook: new order ${order.name} for store ${storeId}`);
}

// ─── Helper: handle Shopify product webhook ───────────────────────────────────
async function handleShopifyProductWebhook(storeId: string, product: any): Promise<void> {
  const price = product.variants?.[0]?.price || "0";
  const stock = product.variants?.[0]?.inventory_quantity ?? null;
  const imageUrl = product.image?.src || null;

  const { rows } = await pool.query(
    `SELECT id FROM products WHERE store_id = $1 AND shopify_product_id = $2 LIMIT 1`,
    [storeId, String(product.id)]
  );

  if (rows[0]) {
    await pool.query(
      `UPDATE products SET name = $1, price = $2, stock = $3, image_url = $4, updated_at = NOW() WHERE id = $5`,
      [product.title, price, stock, imageUrl, rows[0].id]
    );
  }
}

// ─── Compliance (GDPR) webhook URLs ──────────────────────────────────────────
// These three mandatory topics are NOT registered per-shop through the Admin API
// — Shopify treats them as app-level configuration and rejects them on
// POST /webhooks.json. They are set once in Partner Dashboard → App setup →
// Compliance webhooks (or in shopify.app.toml [webhooks.privacy_compliance]),
// and then fire for every shop that installs the app.
// Handlers live above at /webhooks/customers/data_request, /webhooks/customers/redact
// and /webhooks/shop/redact.
export const COMPLIANCE_WEBHOOK_URLS = {
  "customers/data_request": `${API_BASE_URL}/api/shopify/webhooks/customers/data_request`,
  "customers/redact": `${API_BASE_URL}/api/shopify/webhooks/customers/redact`,
  "shop/redact": `${API_BASE_URL}/api/shopify/webhooks/shop/redact`,
} as const;

// ─── Helper: register webhooks ────────────────────────────────────────────────
// Only shop-scoped topics belong here — one per topic FlyChat actually handles
// in the /webhook dispatcher above. Registering a topic with no handler would
// just mean Shopify delivering events this app silently drops.
async function registerWebhooks(
  shop: string,
  accessToken: string,
  storeId: string
): Promise<{ registered: string[]; failed: { topic: string; error: string }[] }> {
  const webhooks = [
    { topic: "orders/create", address: `${API_BASE_URL}/api/shopify/webhook` },
    { topic: "products/update", address: `${API_BASE_URL}/api/shopify/webhook` },
    { topic: "products/create", address: `${API_BASE_URL}/api/shopify/webhook` },
  ];

  const registered: string[] = [];
  const failed: { topic: string; error: string }[] = [];

  for (const wh of webhooks) {
    try {
      await shopifyFetch(shop, accessToken, "/webhooks.json", {
        method: "POST",
        body: JSON.stringify({ webhook: { topic: wh.topic, address: wh.address, format: "json" } }),
      });
      registered.push(wh.topic);
    } catch (err: any) {
      const message = String(err?.message || err);
      // Shopify 422s an exact (topic, address) duplicate — that means the
      // subscription is already in place, so treat it as success.
      if (/already been taken|has already/i.test(message)) {
        registered.push(wh.topic);
        console.log(`[Shopify] Webhook ${wh.topic} already registered for ${shop}`);
      } else {
        failed.push({ topic: wh.topic, error: message });
        console.error(`[Shopify] Failed to register webhook ${wh.topic}:`, err);
      }
    }
  }

  console.log(
    `[Shopify] Webhooks registered for ${shop} (store ${storeId}): ` +
    `${registered.length}/${webhooks.length} ok${failed.length ? `, ${failed.length} failed` : ""}`
  );
  if (failed.length === 0) {
    console.log(
      `[Shopify] Reminder: compliance topics (customers/data_request, customers/redact, shop/redact) ` +
      `are app-level and must be set in the Partner Dashboard, not here.`
    );
  }

  return { registered, failed };
}

// ─── Helper: map Shopify status ───────────────────────────────────────────────
// order_status enum only allows: new, awaiting_confirmation, confirmed, shipped,
// delivered, cancelled, suspicious — any other value fails the insert/update.
function mapShopifyStatus(financialStatus: string): string {
  const map: Record<string, string> = {
    paid: "confirmed",
    pending: "new",
    voided: "cancelled",
    refunded: "cancelled",
    partially_paid: "new",
    partially_refunded: "new",
  };
  return map[financialStatus] || "new";
}

export default router;