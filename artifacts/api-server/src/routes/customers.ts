import { Router } from "express";
import { db, pool, customersTable, ordersTable, conversationsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { ensureCustomerLeadColumns } from "../lib/schema-bootstrap.js";

const router = Router();

// Real lead_stage values, verified against lib/lead-intent.ts — NOT the
// 'engaged'/'qualified'/'confirmed' names a naive guess might use.
const LEAD_STAGE_VALUES = new Set(["interested", "engaged", "qualified_lead", "order_confirmed"]);

router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ customers: [], total: 0, page: 1, limit: 20 }); return; }
    await ensureCustomerLeadColumns();

    const { search, page = "1", limit = "20", stage = "real" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(10, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const params: any[] = [storeId];
    let stageFilter = "";
    if (stage === "real" || !stage) {
      // "Real leads" = actually engaged, not just a PSID that never replied —
      // total_orders > 0 also counts since a completed order is proof of a
      // real interaction even if lead_stage backfill missed it.
      stageFilter = `AND (c.lead_stage IN ('engaged', 'qualified_lead', 'order_confirmed') OR c.total_orders > 0)`;
    } else if (stage !== "all" && LEAD_STAGE_VALUES.has(stage)) {
      params.push(stage);
      stageFilter = `AND c.lead_stage = $${params.length}`;
    }

    let searchFilter = "";
    if (search) {
      params.push(`%${search}%`);
      searchFilter = `AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.email ILIKE $${params.length} OR c.meta_id ILIKE $${params.length})`;
    }

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS count FROM customers c WHERE c.store_id = $1 ${stageFilter} ${searchFilter}`,
      params
    );
    const total = Number(countRows[0]?.count || 0);

    const dataParams = [...params, limitNum, offset];
    const { rows: customers } = await pool.query(
      `SELECT c.*,
         (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
         (SELECT MAX(created_at) FROM conversations cv WHERE cv.customer_id = c.id) AS last_contact
       FROM customers c
       WHERE c.store_id = $1 ${stageFilter} ${searchFilter}
       ORDER BY
         CASE c.lead_stage
           WHEN 'order_confirmed' THEN 1
           WHEN 'qualified_lead' THEN 2
           WHEN 'engaged' THEN 3
           ELSE 4
         END,
         c.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    res.json({ customers, total, page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch customers" });
  }
});

// Ghost = generic placeholder name (never resolved) AND phone is empty or is
// actually a raw PSID/IGSID (those run 15-17 digits; real Algerian numbers
// with country code top out around 13) AND zero orders AND the customer's
// conversation(s) never progressed past 'interested' (no wilaya/phone/size
// signal detected in the chat, no order created). This is a materially
// stricter bar than "0 orders" alone — a customer who shared their wilaya or
// phone in-chat but hasn't ordered yet is excluded, not deleted.
const GHOST_WHERE = `
  c.store_id = $1
  AND (c.name ILIKE 'messenger user' OR c.name ILIKE 'instagram user' OR c.name ILIKE 'facebook user' OR c.name IS NULL OR c.name = '')
  AND (c.phone IS NULL OR c.phone = '' OR LENGTH(c.phone) > 13)
  AND c.total_orders = 0
  AND COALESCE(c.lead_stage, 'interested') = 'interested'
`;

// GET /api/customers/ghosts/preview — count only, no deletion. Always check
// this before calling cleanup-ghosts — the count can differ from any prior
// estimate as new conversations arrive.
router.get("/ghosts/preview", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    await ensureCustomerLeadColumns();
    const { rows } = await pool.query(`SELECT COUNT(*) AS count FROM customers c WHERE ${GHOST_WHERE}`, [storeId]);
    res.json({ count: Number(rows[0]?.count || 0) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to preview ghost customers" });
  }
});

// POST /api/customers/cleanup-ghosts — irreversible delete. Frontend must
// confirm with the user before calling this (see Customers.tsx).
router.post("/cleanup-ghosts", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    await ensureCustomerLeadColumns();

    const { rows: beforeRows } = await pool.query(`SELECT COUNT(*) AS count FROM customers WHERE store_id = $1`, [storeId]);
    const { rowCount } = await pool.query(`DELETE FROM customers c WHERE ${GHOST_WHERE}`, [storeId]);
    const { rows: afterRows } = await pool.query(`SELECT COUNT(*) AS count FROM customers WHERE store_id = $1`, [storeId]);

    res.json({
      success: true,
      deleted: rowCount || 0,
      before: Number(beforeRows[0]?.count || 0),
      after: Number(afterRows[0]?.count || 0),
      message: `Cleaned up ${rowCount || 0} ghost customers`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to clean up ghost customers" });
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
