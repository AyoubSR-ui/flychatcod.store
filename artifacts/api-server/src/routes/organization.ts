import { Router } from "express";
import { db, storesTable, organizationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// GET /api/organization
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.organizationId) {
      res.status(404).json({ error: "not_found", message: "No organization found" });
      return;
    }

    const [org] = await db.select().from(organizationsTable)
      .where(eq(organizationsTable.id, user.organizationId)).limit(1);

    if (!org) { res.status(404).json({ error: "not_found" }); return; }

    const stores = await db.select().from(storesTable)
      .where(eq(storesTable.organizationId, user.organizationId));

    res.json({
      id: org.id,
      name: org.name,
      ownerId: org.ownerId,
      stores: stores.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        phone: s.phone,
        isActive: s.isActive,
        createdAt: s.createdAt,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

// PATCH /api/organization
router.patch("/", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.organizationId) { res.status(400).json({ error: "no_org" }); return; }
    const { name } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: "validation_error", message: "name is required" }); return; }

    const [updated] = await db.update(organizationsTable)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(organizationsTable.id, user.organizationId))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/organization/switch-store — change which store the calling
// user's session operates on. req.user.storeId is re-read from the users
// table on every request (see lib/auth.ts's getUserFromToken — the JWT only
// carries userId), so this takes effect on the very next API call with no
// new token needed. Only allows switching to a store within the caller's
// own organization.
router.post("/switch-store", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { storeId } = req.body as { storeId?: string };
    if (!storeId) { res.status(400).json({ error: "validation_error", message: "storeId is required" }); return; }
    if (!user.organizationId) { res.status(400).json({ error: "no_org", message: "No organization found" }); return; }

    const [store] = await db.select().from(storesTable)
      .where(and(eq(storesTable.id, storeId), eq(storesTable.organizationId, user.organizationId))).limit(1);
    if (!store) { res.status(403).json({ error: "forbidden", message: "Store not found in your organization" }); return; }

    await db.update(usersTable).set({ storeId, updatedAt: new Date() }).where(eq(usersTable.id, user.id));
    res.json({ success: true, storeId, storeName: store.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to switch store" });
  }
});

export default router;