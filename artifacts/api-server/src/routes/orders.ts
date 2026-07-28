import { Router } from "express";
import { db, pool, ordersTable, orderItemsTable, customersTable, conversationsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId, generateOrderNumber } from "../lib/id.js";
import { fireTrigger } from "../lib/automation-engine.js";
import { ensureOrderStatusValues, ensureOrdersAgentColumn } from "../lib/schema-bootstrap.js";
import { ORDERS_BASE_CTE, buildOrderFilters, getDuplicateMatches } from "../lib/order-filters.js";
import { dispatchOrderToCarrier } from "./carriers.js";

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

    const { page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
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
        shipment: o.shipment_id ? {
          id: o.shipment_id,
          carrier: o.shipment_carrier,
          carrierConnectionId: o.shipment_carrier_connection_id,
          trackingNumber: o.shipment_tracking_number,
          status: o.shipment_status,
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
       b.created_at as "createdAt", b.updated_at as "updatedAt"
       FROM base b WHERE b.id = $2 AND b.store_id = $1 LIMIT 1`,
      [storeId, req.params.id]
    );
    if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }
    const order = rows[0];
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    let customer = null;
    if (order.customerId) {
      const [c] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId)).limit(1);
      customer = c || null;
    }
    const dupMatches = await getDuplicateMatches(String(storeId), [order.id]);

    res.json({
      ...order,
      total: Number(order.total),
      shippingFee: Number(order.shippingFee || 0),
      shippingOption: order.shippingOption || null,
      items: items.map(i => ({ ...i, price: Number(i.price) })),
      shipment: order.shipmentId ? {
        id: order.shipmentId,
        carrier: order.shipmentCarrier,
        carrierConnectionId: order.shipmentCarrierConnectionId,
        trackingNumber: order.shipmentTrackingNumber,
        status: order.shipmentStatus,
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
    const { status, sellerNote, wilaya, address, shippingFee, shippingOption, assignedAgentId } = req.body;

    const setClauses: string[] = ["updated_at = NOW()"];
    const params: any[] = [];

    if (status) { params.push(status); setClauses.push(`status = $${params.length}`); }
    if (sellerNote !== undefined) { params.push(sellerNote); setClauses.push(`seller_note = $${params.length}`); }
    if (wilaya) { params.push(wilaya); setClauses.push(`wilaya = $${params.length}`); }
    if (address !== undefined) { params.push(address); setClauses.push(`address = $${params.length}`); }
    if (shippingFee !== undefined) { params.push(String(shippingFee)); setClauses.push(`shipping_fee = $${params.length}`); }
    if (shippingOption !== undefined) { params.push(shippingOption); setClauses.push(`shipping_option = $${params.length}`); }
    if (assignedAgentId !== undefined) { params.push(assignedAgentId || null); setClauses.push(`assigned_agent_id = $${params.length}`); }

    params.push(req.params.id, storeId);
    const { rows } = await pool.query(
      `UPDATE orders SET ${setClauses.join(", ")} WHERE id = $${params.length - 1} AND store_id = $${params.length} RETURNING *`,
      params
    );

    if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }

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
    res.status(400).json({ error: "dispatch_failed", message: err.message || "Failed to create shipment" });
  }
});

export default router;