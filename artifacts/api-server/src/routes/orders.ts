import { Router } from "express";
import { db, pool, ordersTable, orderItemsTable, customersTable, conversationsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId, generateOrderNumber } from "../lib/id.js";
import { fireTrigger } from "../lib/automation-engine.js";

const router = Router();

// ─── GET /api/orders ──────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ orders: [], total: 0, page: 1, limit: 20 }); return; }

    const { status, search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(ordersTable.storeId, String(storeId))];
    if (status) conditions.push(eq(ordersTable.status, status as any));
    if (search) conditions.push(ilike(ordersTable.customerName, `%${search}%`));

    const orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(sql`${ordersTable.createdAt} desc`)
      .limit(limitNum).offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` })
      .from(ordersTable).where(and(...conditions));

    const ordersWithItems = await Promise.all(orders.map(async (order) => {
      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    return {
        ...order,
        total: Number(order.total),
        shippingFee: Number(order.shippingFee || 0),
        shippingOption: order.shippingOption || null,
        items: items.map(i => ({ ...i, price: Number(i.price) })),
      };
    }));

    res.json({ orders: ordersWithItems, total: Number(total), page: pageNum, limit: limitNum });
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
      const { getPlanLimits, planLimitError } = await import("../lib/plan-limits.js");
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
      // plan-limits module not available — skip limit check
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

    await pool.query(
      `INSERT INTO orders (id, order_number, store_id, customer_id, conversation_id, customer_name, customer_phone,
        customer_email, wilaya, address, seller_note, total, shipping_fee, shipping_option, is_cod, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true,'new',NOW(),NOW())`,
      [orderId, generateOrderNumber(), storeId, finalCustomerId || null, conversationId || null,
       customerName, customerPhone, customerEmail || null, wilaya, address || null,
       sellerNote || null, total, String(shippingFee || 0), shippingOption || null]
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
    const { rows } = await pool.query(
      `SELECT id, order_number as "orderNumber", store_id as "storeId", customer_id as "customerId",
       conversation_id as "conversationId", customer_name as "customerName", customer_phone as "customerPhone",
       customer_email as "customerEmail", wilaya, address, status, is_cod as "isCod",
       total, seller_note as "sellerNote", created_by_source as "createdBySource",
       cancelled_by_source as "cancelledBySource", shipping_fee as "shippingFee",
       shipping_option as "shippingOption", created_at as "createdAt", updated_at as "updatedAt"
       FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`,
      [req.params.id, storeId]
    );
    if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }
    const order = rows[0];
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    let customer = null;
    if (order.customerId) {
      const [c] = await db.select().from(customersTable).where(eq(customersTable.id, order.customerId)).limit(1);
      customer = c || null;
    }
    res.json({
      ...order,
      total: Number(order.total),
      shippingFee: Number(order.shippingFee || 0),
      shippingOption: order.shippingOption || null,
      items: items.map(i => ({ ...i, price: Number(i.price) })),
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
    const { status, sellerNote, wilaya, address, shippingFee, shippingOption } = req.body;

    const setClauses: string[] = ["updated_at = NOW()"];
    const params: any[] = [];

    if (status) { params.push(status); setClauses.push(`status = $${params.length}`); }
    if (sellerNote !== undefined) { params.push(sellerNote); setClauses.push(`seller_note = $${params.length}`); }
    if (wilaya) { params.push(wilaya); setClauses.push(`wilaya = $${params.length}`); }
    if (address !== undefined) { params.push(address); setClauses.push(`address = $${params.length}`); }
    if (shippingFee !== undefined) { params.push(String(shippingFee)); setClauses.push(`shipping_fee = $${params.length}`); }
    if (shippingOption !== undefined) { params.push(shippingOption); setClauses.push(`shipping_option = $${params.length}`); }

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

export default router;