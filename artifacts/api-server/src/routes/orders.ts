import { Router } from "express";
import { db, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId, generateOrderNumber } from "../lib/id.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ orders: [], total: 0, page: 1, limit: 20 }); return; }

    const { status, search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(ordersTable.storeId, storeId)];
    if (status) conditions.push(eq(ordersTable.status, status as any));
    if (search) conditions.push(ilike(ordersTable.customerName, `%${search}%`));

    const orders = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(sql`${ordersTable.createdAt} desc`)
      .limit(limitNum).offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(ordersTable).where(and(...conditions));

    const ordersWithItems = await Promise.all(orders.map(async (order) => {
      const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
      return { ...order, total: Number(order.total), items: items.map(i => ({ ...i, price: Number(i.price) })) };
    }));

    res.json({ orders: ordersWithItems, total: Number(total), page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch orders" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { customerName, customerPhone, wilaya, address, customerId, conversationId, sellerNote, items = [] } = req.body;
    if (!customerName || !customerPhone || !wilaya || items.length === 0) {
      res.status(400).json({ error: "validation_error", message: "customerName, customerPhone, wilaya, and items are required" });
      return;
    }

    const total = items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    const orderId = generateId("ord");

    const [order] = await db.insert(ordersTable).values({
      id: orderId,
      orderNumber: generateOrderNumber(),
      storeId,
      customerId,
      conversationId,
      customerName,
      customerPhone,
      wilaya,
      address,
      sellerNote,
      total: total.toString(),
      isCod: true,
      status: "new",
    }).returning();

    for (const item of items) {
      await db.insert(orderItemsTable).values({
        id: generateId("oi"),
        orderId,
        productId: item.productId,
        productName: item.productName,
        variant: item.variant,
        quantity: item.quantity,
        price: item.price.toString(),
      });
    }

    const orderItems = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
    res.status(201).json({ ...order, total: Number(order.total), items: orderItems.map(i => ({ ...i, price: Number(i.price) })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create order" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const [order] = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.id, req.params.id), eq(ordersTable.storeId, storeId!))).limit(1);

    if (!order) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }

    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
    res.json({ ...order, total: Number(order.total), items: items.map(i => ({ ...i, price: Number(i.price) })), customer: null, conversation: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch order" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { status, sellerNote, wilaya, address } = req.body;
    const updates: Partial<typeof ordersTable.$inferSelect> = { updatedAt: new Date() };
    if (status) updates.status = status;
    if (sellerNote !== undefined) updates.sellerNote = sellerNote;
    if (wilaya) updates.wilaya = wilaya;
    if (address !== undefined) updates.address = address;

    const [updated] = await db.update(ordersTable).set(updates)
      .where(and(eq(ordersTable.id, req.params.id), eq(ordersTable.storeId, storeId!)))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }
    const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, updated.id));
    res.json({ ...updated, total: Number(updated.total), items: items.map(i => ({ ...i, price: Number(i.price) })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update order" });
  }
});

export default router;
