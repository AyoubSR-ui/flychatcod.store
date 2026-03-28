import { Router } from "express";
import { db, storesTable, organizationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;