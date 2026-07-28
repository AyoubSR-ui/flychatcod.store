import { Router } from "express";
import { db, pool, storesTable, productsTable, ordersTable, orderItemsTable, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import crypto from "crypto";

const router = Router();

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";
const APP_BASE_URL = process.env.APP_BASE_URL || "https://flychatcodstore-production-a2e8.up.railway.app";
const API_BASE_URL = process.env.API_BASE_URL || "https://zealous-nature-production-771f.up.railway.app";

const SCOPES = "read_products,write_orders,read_orders,read_customers";

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
  const token = req.query.token as string || "";

  if (!shop) { res.status(400).json({ error: "shop parameter required" }); return; }

  // Validate shop domain
  if (!shop.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/)) {
    res.status(400).json({ error: "Invalid shop domain" });
    return;
  }

  const storeId = req.user!.storeId || "";
  const state = Buffer.from(JSON.stringify({ storeId, token })).toString("base64");

  const authUrl = `https://${shop}/admin/oauth/authorize?` + new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SCOPES,
    redirect_uri: `${API_BASE_URL}/api/shopify/callback`,
    state,
  });

  res.json({ url: authUrl });
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
    const params = { ...req.query } as Record<string, string>;
    delete params.hmac;
    const message = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
    const digest = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(message).digest("hex");
    if (digest !== hmac) {
      res.redirect(`${APP_BASE_URL}/channels?error=shopify_invalid_hmac`);
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

    // Decode state to get storeId
    const { storeId } = JSON.parse(Buffer.from(state, "base64").toString());

    // Save to store
    await pool.query(
      `UPDATE stores SET shopify_shop = $1, shopify_access_token = $2, shopify_scope = $3, updated_at = NOW() WHERE id = $4`,
      [shop, tokenData.access_token, tokenData.scope, storeId]
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
      `UPDATE stores SET shopify_shop = NULL, shopify_access_token = NULL, shopify_scope = NULL WHERE id = $1`,
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

// ─── POST /api/shopify/webhook ────────────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  try {
    const hmac = req.headers["x-shopify-hmac-sha256"] as string;
    const shop = req.headers["x-shopify-shop-domain"] as string;
    const topic = req.headers["x-shopify-topic"] as string;

    // Verify webhook
    const body = JSON.stringify(req.body);
    const digest = crypto.createHmac("sha256", SHOPIFY_API_SECRET).update(body).digest("base64");
    if (digest !== hmac) {
      res.status(401).send("Unauthorized");
      return;
    }

    const { rows } = await pool.query(
      `SELECT id FROM stores WHERE shopify_shop = $1 LIMIT 1`,
      [shop]
    );
    const storeId = rows[0]?.id;
    if (!storeId) { res.json({ received: true }); return; }

    if (topic === "orders/create") {
      await handleShopifyOrderWebhook(storeId, req.body);
    } else if (topic === "products/update" || topic === "products/create") {
      await handleShopifyProductWebhook(storeId, req.body);
    }

    res.json({ received: true });
  } catch (err) {
    console.error("[Shopify] Webhook error:", err);
    res.json({ received: true });
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
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16,$17,$18,$19,$20,'shopify',$21,$22,NOW())`,
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
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16,$17,$18,$19,$20,'shopify',$21,NOW(),NOW())`,
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

// ─── Helper: register webhooks ────────────────────────────────────────────────
async function registerWebhooks(shop: string, accessToken: string, storeId: string): Promise<void> {
  const webhooks = [
    { topic: "orders/create", address: `${API_BASE_URL}/api/shopify/webhook` },
    { topic: "products/update", address: `${API_BASE_URL}/api/shopify/webhook` },
    { topic: "products/create", address: `${API_BASE_URL}/api/shopify/webhook` },
  ];

  for (const wh of webhooks) {
    try {
      await shopifyFetch(shop, accessToken, "/webhooks.json", {
        method: "POST",
        body: JSON.stringify({ webhook: { topic: wh.topic, address: wh.address, format: "json" } }),
      });
    } catch (err) {
      console.error(`[Shopify] Failed to register webhook ${wh.topic}:`, err);
    }
  }
  console.log(`[Shopify] Webhooks registered for ${shop}`);
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