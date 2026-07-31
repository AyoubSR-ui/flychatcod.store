import { Router } from "express";
import { db, pool, ordersTable, orderItemsTable, customersTable, conversationsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId, generateOrderNumber } from "../lib/id.js";
import { fireTrigger } from "../lib/automation-engine.js";
import { ensureOrderStatusValues, ensureOrdersAgentColumn, ensureScheduledParcelsTable } from "../lib/schema-bootstrap.js";
import { ORDERS_BASE_CTE, buildOrderFilters, getDuplicateMatches } from "../lib/order-filters.js";
import { dispatchOrderToCarrier, refreshShipmentStatus } from "./carriers.js";
import { logOrderEvent } from "../lib/order-events.js";
import { ensureOrderEventsTable } from "../lib/schema-bootstrap.js";

const router = Router();

// ─── GET /api/orders/stats — KPI summary bar ───────────────────────────────────
// Respects the same filters as the list (minus pagination) so "Livrées/période"
// etc. track whatever date range / filters are currently active in the UI.
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ total: 0, today: 0, confirmed: 0, confirmedRate: 0, cancelled: 0, cancelledRate: 0, deliveryFailed: 0, deliveryFailedRate: 0, deliveryRate: 0, delivered: 0 }); return; }
    await ensureOrderStatusValues();

    const { whereSQL, values } = await buildOrderFilters(storeId, req.query as Record<string, string>);
    const { rows } = await pool.query(
      `${ORDERS_BASE_CTE}
       SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE b.created_at >= date_trunc('day', now())) AS today,
         COUNT(*) FILTER (WHERE b.status IN ('confirmed','self_confirmed','shipped','delivered')) AS confirmed,
         COUNT(*) FILTER (WHERE b.status = 'cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE b.shipment_status = 'failed') AS delivery_failed,
         COUNT(*) FILTER (WHERE b.status = 'delivered' OR b.shipment_status = 'delivered') AS delivered
       FROM base b WHERE ${whereSQL}`,
      values
    );
    const r = rows[0];
    const total = Number(r.total) || 0;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
    res.json({
      total,
      today: Number(r.today) || 0,
      confirmed: Number(r.confirmed) || 0,
      confirmedRate: pct(Number(r.confirmed) || 0),
      cancelled: Number(r.cancelled) || 0,
      cancelledRate: pct(Number(r.cancelled) || 0),
      deliveryFailed: Number(r.delivery_failed) || 0,
      deliveryFailedRate: pct(Number(r.delivery_failed) || 0),
      delivered: Number(r.delivered) || 0,
      deliveryRate: pct(Number(r.delivered) || 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch order stats" });
  }
});

// ─── GET /api/orders ──────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ orders: [], total: 0, page: 1, limit: 20 }); return; }
    await ensureOrderStatusValues();
    await ensureOrdersAgentColumn();
    await ensureScheduledParcelsTable();

    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const { whereSQL, values } = await buildOrderFilters(storeId, req.query as Record<string, string>);

    const { rows: countRows } = await pool.query(
      `${ORDERS_BASE_CTE} SELECT COUNT(*) as total FROM base b WHERE ${whereSQL}`, values
    );
    const sortDir = (req.query.sort as string) === "asc" ? "ASC" : "DESC";
    const dataValues = [...values, limitNum, offset];
    const { rows: orders } = await pool.query(
      `${ORDERS_BASE_CTE} SELECT * FROM base b WHERE ${whereSQL} ORDER BY b.created_at ${sortDir} LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
      dataValues
    );

    const dupMatches = await getDuplicateMatches(storeId, orders.map((o: any) => o.id));

    const ordersWithItems = await Promise.all(orders.map(async (o: any) => {
      // Use JSONB items for Shopify orders; fall back to order_items table for COD orders
      let items = Array.isArray(o.items) && o.items.length > 0 ? o.items : [];
      if (!items.length) {
        const { rows: itemRows } = await pool.query(
          `SELECT product_name as title, variant as variant_title, quantity, price FROM order_items WHERE order_id = $1`,
          [o.id]
        );
        items = itemRows.map((i: any) => ({ ...i, price: Number(i.price) }));
      }
      return {
        id: o.id,
        storeId: o.store_id,
        status: o.status,
        orderNumber: o.order_number,
        shopifyOrderNumber: o.shopify_order_number,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        customerEmail: o.customer_email,
        wilaya: o.wilaya,
        address: o.address,
        shippingAddress: o.shipping_address,
        total: Number(o.total),
        shippingFee: Number(o.shipping_fee || 0),
        shippingOption: o.shipping_option,
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status,
        deliveryStatus: o.delivery_status,
        salesChannel: o.sales_channel,
        source: o.computed_source,
        flags: o.flags || [],
        tags: o.tags,
        items,
        shopifyOrderId: o.shopify_order_id,
        createdBySource: o.created_by_source,
        cancelledBySource: o.cancelled_by_source,
        confirmedBySource: o.confirmed_by_source,
        sellerNote: o.seller_note,
        assignedAgentId: o.assigned_agent_id,
        assignedAgentName: o.agent_name,
        scheduledShipDate: o.scheduled_ship_date,
        scheduleNote: o.schedule_note,
        shipment: o.shipment_id ? {
          id: o.shipment_id,
          carrier: o.shipment_carrier,
          carrierConnectionId: o.shipment_carrier_connection_id,
          trackingNumber: o.shipment_tracking_number,
          status: o.shipment_status,
          manualTrackingUrl: o.shipment_manual_tracking_url || null,
        } : null,
        duplicateOf: dupMatches.get(o.id) || [],
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      };
    }));

    res.json({ orders: ordersWithItems, total: Number(countRows[0]?.total || 0), page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch orders" });
  }
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────
    router.post("/", requireAuth, async (req, res) => {
      try {
        const storeId = req.user!.storeId;
        if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

        const {
          customerName, customerPhone, customerEmail, wilaya, address,
          customerId, conversationId, sellerNote, shippingFee = 0,
          shippingOption = null, items = []
        } = req.body;

        if (!customerName || !customerPhone || !wilaya || items.length === 0) {
          res.status(400).json({ error: "validation_error", message: "customerName, customerPhone, wilaya, and items are required" });
          return;
        }

      // ─── Plan order limit check ───────────────────────────────────────────────
    try {
      const planLimitsPath = "../lib/plan-limits.js";
      const { getPlanLimits, planLimitError } = await import(planLimitsPath);
      const limits = await getPlanLimits(storeId);
      if (limits.ordersPerMonth !== -1) {
        const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
        const { rows } = await pool.query(
          `SELECT COUNT(*) as count FROM orders WHERE store_id = $1 AND created_at >= $2`,
          [storeId, startOfMonth]
        );
        if (parseInt(rows[0].count) >= limits.ordersPerMonth) {
          res.status(403).json(planLimitError("orders", limits.plan, `${limits.ordersPerMonth} orders/month`));
          return;
        }
      }
    } catch {
      // plan-limits module not yet implemented — skip check
    }

    // ─── Customer linking ─────────────────────────────────────────────────────
    let finalCustomerId: string | undefined = customerId;
    if (!finalCustomerId && customerPhone) {
      const [existing] = await db.select().from(customersTable)
        .where(and(eq(customersTable.storeId, storeId), eq(customersTable.phone, customerPhone))).limit(1);

      if (existing) {
        await db.update(customersTable).set({
          name: customerName || existing.name,
          ...(customerEmail && !existing.email ? { email: customerEmail } : {}),
          ...(wilaya && !existing.wilaya ? { wilaya } : {}),
          updatedAt: new Date(),
        }).where(eq(customersTable.id, existing.id));
        finalCustomerId = existing.id;
      } else {
        const [newCustomer] = await db.insert(customersTable).values({
          id: generateId("cust"),
          storeId,
          name: customerName,
          phone: customerPhone,
          email: customerEmail || null,
          wilaya: wilaya || null,
        }).returning();
        finalCustomerId = newCustomer.id;
      }
    }

    const itemsTotal = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const total = (itemsTotal + Number(shippingFee)).toFixed(2);
    const orderId = generateId("ord");

    // ─── Inherit agent assignment from the conversation, if any ────────────────
    await ensureOrdersAgentColumn();
    let assignedAgentId: string | null = null;
    if (conversationId) {
      const [conv] = await db.select({ assignedToId: conversationsTable.assignedToId })
        .from(conversationsTable)
        .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.storeId, storeId))).limit(1);
      assignedAgentId = conv?.assignedToId || null;
    }

    await pool.query(
      `INSERT INTO orders (id, order_number, store_id, customer_id, conversation_id, customer_name, customer_phone,
        customer_email, wilaya, address, seller_note, total, shipping_fee, shipping_option, is_cod, status, assigned_agent_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,'new',$15,NOW(),NOW())`,
      [orderId, generateOrderNumber(), storeId, finalCustomerId || null, conversationId || null,
       customerName, customerPhone, customerEmail || null, wilaya, address || null,
       sellerNote || null, total, String(shippingFee || 0), shippingOption || null, assignedAgentId]
    );

    for (const item of items) {
      await db.insert(orderItemsTable).values({
        id: generateId("oi"),
        orderId,
        productId: item.productId || null,
        productName: item.productName,
        variant: item.variant || null,
        quantity: item.quantity,
        price: item.price.toString(),
      });
    }

    // ─── Update conversation ──────────────────────────────────────────────────
    if (conversationId && finalCustomerId) {
      const [conv] = await db.select({ id: conversationsTable.id, storeId: conversationsTable.storeId, customerName: conversationsTable.customerName })
        .from(conversationsTable)
        .where(and(eq(conversationsTable.id, conversationId), eq(conversationsTable.storeId, storeId))).limit(1);

      if (conv) {
        const convUpdates: Record<string, unknown> = { customerId: finalCustomerId, updatedAt: new Date() };
        if (conv.customerName.startsWith("Visitor ") || conv.customerName.startsWith("visitor ")) {
          convUpdates.customerName = customerName;
          convUpdates.customerPhone = customerPhone;
        }
        await db.update(conversationsTable).set(convUpdates).where(eq(conversationsTable.id, conversationId));
      }
    }

    // ─── Update customer order count ──────────────────────────────────────────
    if (finalCustomerId) {
      const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` })
        .from(ordersTable)
        .where(and(eq(ordersTable.customerId, finalCustomerId), eq(ordersTable.storeId, String(storeId))));
      const totalOrders = Number(cnt);
      await db.update(customersTable).set({ totalOrders, isRepeat: totalOrders > 1, updatedAt: new Date() })
        .where(eq(customersTable.id, finalCustomerId));
    }

    const { rows: orderRows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
    const orderItems = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));

    res.status(201).json({
      ...orderRows[0],
      total: Number(orderRows[0].total),
      shippingFee: Number(orderRows[0].shipping_fee || 0),
      shippingOption: orderRows[0].shipping_option || null,
      items: orderItems.map(i => ({ ...i, price: Number(i.price) })),
      customerId: finalCustomerId,
    });

    if (conversationId) {
      fireTrigger({
        storeId,
        conversationId,
        triggerType: "order_created",
        orderId,
        orderNumber: orderRows[0].order_number,
        customerName,
      }).catch(err => console.error("[Orders] order_created automation error:", err));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create order" });
  }
});

// ─── GET /api/orders/:id ──────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await ensureOrdersAgentColumn();
    await ensureScheduledParcelsTable();
    const { rows } = await pool.query(
      `${ORDERS_BASE_CTE}
       SELECT b.id, b.order_number as "orderNumber", b.store_id as "storeId", b.customer_id as "customerId",
       b.conversation_id as "conversationId", b.customer_name as "customerName", b.customer_phone as "customerPhone",
       b.customer_email as "customerEmail", b.wilaya, b.address, b.status, b.is_cod as "isCod",
       b.total, b.seller_note as "sellerNote", b.created_by_source as "createdBySource",
       b.cancelled_by_source as "cancelledBySource", b.confirmed_by_source as "confirmedBySource",
       b.shipping_fee as "shippingFee", b.shipping_option as "shippingOption",
       b.computed_source as "source", b.assigned_agent_id as "assignedAgentId", b.agent_name as "assignedAgentName",
       b.shipment_id as "shipmentId", b.shipment_carrier as "shipmentCarrier",
       b.shipment_carrier_connection_id as "shipmentCarrierConnectionId",
       b.shipment_tracking_number as "shipmentTrackingNumber", b.shipment_status as "shipmentStatus",
       b.shipment_manual_tracking_url as "shipmentManualTrackingUrl",
       b.scheduled_ship_date as "scheduledShipDate", b.schedule_note as "scheduleNote",
       b.items as "jsonItems",
       b.created_at as "createdAt", b.updated_at as "updatedAt"
       FROM base b WHERE b.id = $2 AND b.store_id = $1 LIMIT 1`,
      [storeId, req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }
    const order = rows[0];
    // Shopify-synced orders carry their line items in the orders.items JSONB
    // column, not the order_items table — fall back to it, same as GET /.
    let items: any[] = Array.isArray(order.jsonItems) && order.jsonItems.length > 0 ? order.jsonItems : [];
    if (!items.length) {
      const rows = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      items = rows.map(i => ({ ...i, price: Number(i.price) }));
    }
    let customer = null;
    if (order.customerId) {
      const [c] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId)).limit(1);
      customer = c || null;
    }
    const dupMatches = await getDuplicateMatches(String(storeId), [order.id]);
    const { jsonItems, ...orderFields } = order;

    res.json({
      ...orderFields,
      total: Number(order.total),
      shippingFee: Number(order.shippingFee || 0),
      shippingOption: order.shippingOption || null,
      items,
      shipment: order.shipmentId ? {
        id: order.shipmentId,
        carrier: order.shipmentCarrier,
        carrierConnectionId: order.shipmentCarrierConnectionId,
        trackingNumber: order.shipmentTrackingNumber,
        status: order.shipmentStatus,
        manualTrackingUrl: order.shipmentManualTrackingUrl || null,
      } : null,
      duplicateOf: dupMatches.get(order.id) || [],
      customer,
      conversation: null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch order" });
  }
});

// ─── PATCH /api/orders/:id ────────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await ensureOrderStatusValues();
    await ensureOrdersAgentColumn();
    const { status, sellerNote, wilaya, address, shippingFee, shippingOption, assignedAgentId, customerName, customerPhone } = req.body;

    let previousStatus: string | null = null;
    if (status) {
      const { rows: current } = await pool.query(`SELECT status FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`, [req.params.id, storeId]);
      previousStatus = current[0]?.status ?? null;
    }

    const setClauses: string[] = ["updated_at = NOW()"];
    const params: any[] = [];

    if (status) { params.push(status); setClauses.push(`status = $${params.length}`); }
    if (sellerNote !== undefined) { params.push(sellerNote); setClauses.push(`seller_note = $${params.length}`); }
    if (wilaya) { params.push(wilaya); setClauses.push(`wilaya = $${params.length}`); }
    if (address !== undefined) { params.push(address); setClauses.push(`address = $${params.length}`); }
    if (shippingFee !== undefined) { params.push(String(shippingFee)); setClauses.push(`shipping_fee = $${params.length}`); }
    if (shippingOption !== undefined) { params.push(shippingOption); setClauses.push(`shipping_option = $${params.length}`); }
    if (assignedAgentId !== undefined) { params.push(assignedAgentId || null); setClauses.push(`assigned_agent_id = $${params.length}`); }
    if (customerName !== undefined) { params.push(customerName); setClauses.push(`customer_name = $${params.length}`); }
    if (customerPhone !== undefined) { params.push(customerPhone); setClauses.push(`customer_phone = $${params.length}`); }

    params.push(req.params.id, storeId);
    const { rows } = await pool.query(
      `UPDATE orders SET ${setClauses.join(", ")} WHERE id = $${params.length - 1} AND store_id = $${params.length} RETURNING *`,
      params
    );

    if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }

    if (status && status !== previousStatus) {
      logOrderEvent({
        orderId: rows[0].id,
        eventType: "status_change",
        fromStatus: previousStatus,
        toStatus: status,
        createdBy: req.user!.name || req.user!.email || "System",
      }).catch(err => console.error("[Orders] Failed to log status_change event:", err));

      // A confirmed/shipped/delivered order is the strongest possible lead
      // signal — 'order_confirmed' is already the top rank in lib/lead-intent.ts,
      // so this is always an upgrade (or a no-op if already there), never a downgrade.
      if (rows[0].customer_id && ["confirmed", "self_confirmed", "shipped", "delivered"].includes(status)) {
        pool.query(`UPDATE customers SET lead_stage = 'order_confirmed', updated_at = NOW() WHERE id = $1`, [rows[0].customer_id])
          .catch(err => console.error("[Orders] Failed to sync customer lead_stage:", err));
      }
    }

    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, rows[0].id));
    res.json({
      ...rows[0],
      total: Number(rows[0].total),
      shippingFee: Number(rows[0].shipping_fee || 0),
      shippingOption: rows[0].shipping_option || null,
      items: items.map(i => ({ ...i, price: Number(i.price) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update order" });
  }
});

// ─── PUT /api/orders/:id/items — replace order items (add/remove/edit) ────────
router.put("/:id/items", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { items } = req.body as { items?: Array<{ productId?: string; productName: string; variant?: string; quantity: number; price: number }> };
    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "validation_error", message: "At least one item is required" });
      return;
    }
    for (const item of items) {
      if (!item.productName?.trim() || item.quantity < 1 || item.price < 0) {
        res.status(400).json({ error: "validation_error", message: "Each item needs a product name, quantity ≥ 1, and a non-negative price" });
        return;
      }
    }

    const { rows: orderRows } = await pool.query(`SELECT id, shipping_fee FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`, [req.params.id, storeId]);
    if (!orderRows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }
    const orderId = orderRows[0].id;

    await db.delete(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
    for (const item of items) {
      await db.insert(orderItemsTable).values({
        id: generateId("oi"),
        orderId,
        productId: item.productId || null,
        productName: item.productName,
        variant: item.variant || null,
        quantity: item.quantity,
        price: item.price.toString(),
      });
    }

    const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const shippingFee = Number(orderRows[0].shipping_fee || 0);
    const newTotal = (itemsTotal + shippingFee).toFixed(2);

    // Editing here makes order_items the source of truth going forward — clear
    // any stale JSONB items (Shopify-synced orders) so GET /:id and GET / stop
    // preferring the now-outdated JSONB snapshot over this edit.
    const { rows } = await pool.query(
      `UPDATE orders SET total = $1, items = '[]'::jsonb, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [newTotal, orderId]
    );

    const savedItems = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
    res.json({
      ...rows[0],
      total: Number(rows[0].total),
      shippingFee: Number(rows[0].shipping_fee || 0),
      shippingOption: rows[0].shipping_option || null,
      items: savedItems.map(i => ({ ...i, price: Number(i.price) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update order items" });
  }
});

// ─── GET /api/orders/:id/events — timeline ────────────────────────────────────
router.get("/:id/events", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await ensureOrderEventsTable();
    const { rows: orderRows } = await pool.query(`SELECT id FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`, [req.params.id, storeId]);
    if (!orderRows[0]) { res.status(404).json({ error: "not_found" }); return; }

    const { rows } = await pool.query(
      `SELECT id, event_type as "eventType", from_status as "fromStatus", to_status as "toStatus",
              description, created_by as "createdBy", metadata, created_at as "createdAt"
       FROM order_events WHERE order_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ events: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch order events" });
  }
});

// ─── POST /api/orders/:id/refresh-tracking — poll carrier for latest status ───
router.post("/:id/refresh-tracking", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    const result = await refreshShipmentStatus(String(storeId), String(req.params.id));
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Orders] Refresh tracking error:", err);
    res.status(400).json({ error: "refresh_failed", message: err.message || "Failed to refresh tracking status" });
  }
});

// ─── POST /api/orders/:id/sync-shopify — voluntary, manual push of note/tags ──
// to the ALREADY-EXISTING Shopify order. FlyChat edits never auto-sync to
// Shopify (confirmed: no such call exists in PATCH /:id) — this is the only
// way data flows from FlyChat back to Shopify, and it only touches note/tags,
// never price/items/customer — those stay Shopify's source of truth.
router.post("/:id/sync-shopify", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { rows } = await pool.query(
      `SELECT shopify_order_id, order_number, status FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`,
      [req.params.id, storeId]
    );
    const order = rows[0];
    if (!order) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }
    if (!order.shopify_order_id) {
      res.status(400).json({ error: "not_shopify_order", message: "This order didn't come from Shopify — there's nothing to sync." });
      return;
    }

    const { rows: storeRows } = await pool.query(
      `SELECT shopify_shop, shopify_access_token FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    const shop = storeRows[0]?.shopify_shop;
    const accessToken = storeRows[0]?.shopify_access_token;
    if (!shop || !accessToken) {
      res.status(400).json({ error: "shopify_not_connected", message: "Shopify isn't connected for this store." });
      return;
    }

    const { rows: shipmentRows } = await pool.query(
      `SELECT tracking_number, carrier FROM shipments WHERE order_id = $1 AND store_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id, storeId]
    );
    const shipment = shipmentRows[0];

    const note = `FlyChat COD — status: ${order.status}` + (shipment?.tracking_number ? ` | tracking: ${shipment.tracking_number} (${shipment.carrier})` : "");

    const shopifyRes = await fetch(`https://${shop}/admin/api/2024-01/orders/${order.shopify_order_id}.json`, {
      method: "PUT",
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ order: { id: order.shopify_order_id, note, tags: "flychat-cod" } }),
    });
    if (!shopifyRes.ok) {
      const errorText = await shopifyRes.text();
      res.status(400).json({ error: "shopify_error", message: `Shopify rejected the sync (${shopifyRes.status}): ${errorText}` });
      return;
    }

    await logOrderEvent({
      orderId: String(req.params.id), eventType: "note_added", createdBy: req.user!.name || req.user!.email || "System",
      description: "Synced to Shopify (note + tags)",
    }).catch(err => console.error("[Orders] Failed to log sync-shopify event:", err));

    res.json({ success: true, message: "Synced to Shopify" });
  } catch (err: any) {
    console.error("[Orders] Shopify sync error:", err);
    res.status(500).json({ error: "internal_error", message: err.message || "Failed to sync to Shopify" });
  }
});

// ─── POST /api/orders/:id/schedule — defer parcel creation to a future date ───
router.post("/:id/schedule", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    await ensureScheduledParcelsTable();

    const { carrierConnectionId, scheduledDate, note } = req.body as { carrierConnectionId?: string; scheduledDate?: string; note?: string };
    if (!carrierConnectionId || !scheduledDate) {
      res.status(400).json({ error: "validation_error", message: "carrierConnectionId and scheduledDate are required" });
      return;
    }
    const date = new Date(scheduledDate);
    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      res.status(400).json({ error: "validation_error", message: "scheduledDate must be a valid date in the future" });
      return;
    }

    const { rows: connRows } = await pool.query(`SELECT id FROM carrier_connections WHERE id = $1 AND store_id = $2 LIMIT 1`, [carrierConnectionId, storeId]);
    if (!connRows[0]) { res.status(400).json({ error: "validation_error", message: "Carrier account not found" }); return; }

    const { rows: orderRows } = await pool.query(`SELECT id, status FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`, [req.params.id, storeId]);
    if (!orderRows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }

    await pool.query(
      `UPDATE orders SET status = 'scheduled', scheduled_ship_date = $1, schedule_note = $2, updated_at = NOW() WHERE id = $3 AND store_id = $4`,
      [date, note || null, req.params.id, storeId]
    );

    const scheduleId = generateId("sch");
    await pool.query(
      `INSERT INTO scheduled_parcels (id, order_id, store_id, carrier_connection_id, scheduled_date, note, status, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, NOW())`,
      [scheduleId, req.params.id, storeId, carrierConnectionId, date, note || null, req.user!.name || req.user!.email || "System"]
    );

    logOrderEvent({
      orderId: String(req.params.id), eventType: "parcel_scheduled", fromStatus: orderRows[0].status, toStatus: "scheduled",
      createdBy: req.user!.name || req.user!.email || "System",
      description: `Colis programmé pour le ${date.toLocaleDateString("fr-DZ")}${note ? ` — ${note}` : ""}`,
    }).catch(err => console.error("[Orders] Failed to log parcel_scheduled event:", err));

    res.json({ success: true, scheduleId, scheduledDate: date });
  } catch (err: any) {
    console.error("[Orders] Schedule error:", err);
    res.status(500).json({ error: "internal_error", message: err.message || "Failed to schedule parcel" });
  }
});

// ─── DELETE /api/orders/:id/schedule — cancel a pending scheduled parcel ──────
router.delete("/:id/schedule", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    await ensureScheduledParcelsTable();

    const { rows: orderRows } = await pool.query(`SELECT id, status FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`, [req.params.id, storeId]);
    if (!orderRows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }

    await pool.query(`UPDATE scheduled_parcels SET status = 'cancelled' WHERE order_id = $1 AND store_id = $2 AND status = 'pending'`, [req.params.id, storeId]);
    await pool.query(
      `UPDATE orders SET status = 'confirmed', scheduled_ship_date = NULL, schedule_note = NULL, updated_at = NOW() WHERE id = $1 AND store_id = $2`,
      [req.params.id, storeId]
    );

    logOrderEvent({
      orderId: String(req.params.id), eventType: "schedule_cancelled", fromStatus: "scheduled", toStatus: "confirmed",
      createdBy: req.user!.name || req.user!.email || "System", description: "Programmation annulée",
    }).catch(err => console.error("[Orders] Failed to log schedule_cancelled event:", err));

    res.json({ success: true });
  } catch (err: any) {
    console.error("[Orders] Cancel schedule error:", err);
    res.status(500).json({ error: "internal_error", message: err.message || "Failed to cancel schedule" });
  }
});

// ─── POST /api/orders/:id/dispatch — create a shipment (colis) with a carrier ─
router.post("/:id/dispatch", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    const { carrierConnectionId } = req.body as { carrierConnectionId?: string };
    if (!carrierConnectionId) { res.status(400).json({ error: "validation_error", message: "carrierConnectionId is required" }); return; }

    const result = await dispatchOrderToCarrier(String(storeId), String(req.params.id), carrierConnectionId);
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error("[Orders] Dispatch error:", err);
    res.status(400).json({ error: "dispatch_failed", message: describeDispatchError(err) });
  }
});

// Node's fetch() throws a generic "fetch failed" TypeError for any network-level
// failure — the actual reason lives in err.cause. Surface it so a DNS/TLS/
// connection problem doesn't show up as an opaque "fetch failed" to the merchant.
function describeDispatchError(err: any): string {
  const cause = err?.cause;
  if (cause?.code === "ENOTFOUND") return `Carrier's server domain (${cause.hostname || "unknown"}) could not be found — its API domain may have changed.`;
  if (cause?.code === "ECONNREFUSED") return `Carrier's server refused the connection (${cause.address || cause.hostname || "unknown"}).`;
  if (cause?.code === "ETIMEDOUT" || cause?.code === "UND_ERR_CONNECT_TIMEOUT") return "Carrier's server took too long to respond (timed out).";
  if (cause?.message) return `${err.message}: ${cause.message}`;
  return err?.message || "Failed to create shipment";
}

export default router;