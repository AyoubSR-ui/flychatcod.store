import { Router } from "express";
import { db, customersTable, ordersTable, conversationsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ customers: [], total: 0, page: 1, limit: 20 }); return; }

    const { search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(customersTable.storeId, storeId)];
    if (search) conditions.push(ilike(customersTable.name, `%${search}%`));

    const customers = await db.select().from(customersTable)
      .where(and(...conditions))
      .orderBy(sql`${customersTable.createdAt} desc`)
      .limit(limitNum).offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(customersTable).where(and(...conditions));
    res.json({ customers, total: Number(total), page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch customers" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { name, phone, email, wilaya, notes } = req.body;
    if (!name) { res.status(400).json({ error: "validation_error", message: "name is required" }); return; }

    const [customer] = await db.insert(customersTable).values({
      id: generateId("cust"),
      storeId,
      name,
      phone,
      email,
      wilaya,
      notes,
    }).returning();

    res.status(201).json(customer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create customer" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const [customer] = await db.select().from(customersTable)
      .where(and(eq(customersTable.id, req.params.id), eq(customersTable.storeId, storeId!))).limit(1);

    if (!customer) { res.status(404).json({ error: "not_found", message: "Customer not found" }); return; }

    const orders = await db.select().from(ordersTable)
      .where(and(eq(ordersTable.customerId, customer.id), eq(ordersTable.storeId, storeId!)))
      .limit(10);

    const conversations = await db.select().from(conversationsTable)
      .where(and(eq(conversationsTable.customerId, customer.id), eq(conversationsTable.storeId, storeId!)))
      .limit(10);

    res.json({
      ...customer,
      orders: orders.map(o => ({ id: o.id, orderNumber: o.orderNumber, customerName: o.customerName, total: Number(o.total), status: o.status, createdAt: o.createdAt })),
      conversations: conversations.map(c => ({ id: c.id, customerName: c.customerName, lastMessage: c.lastMessage || "", status: c.status, updatedAt: c.updatedAt })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch customer" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { name, phone, email, wilaya, notes } = req.body;
    const updates: Partial<typeof customersTable.$inferSelect> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (email !== undefined) updates.email = email;
    if (wilaya !== undefined) updates.wilaya = wilaya;
    if (notes !== undefined) updates.notes = notes;

    const [updated] = await db.update(customersTable).set(updates)
      .where(and(eq(customersTable.id, req.params.id), eq(customersTable.storeId, storeId!)))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Customer not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update customer" });
  }
});

export default router;
