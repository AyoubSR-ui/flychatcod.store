import { Router } from "express";
import { db, teamMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

router.get("/members", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ members: [] }); return; }
    const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.storeId, storeId));
    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch team members" });
  }
});

router.post("/members", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { email, role } = req.body;
    if (!email || !role) { res.status(400).json({ error: "validation_error", message: "email and role are required" }); return; }

    const [member] = await db.insert(teamMembersTable).values({
      id: generateId("tm"),
      storeId,
      email,
      role: role as "owner" | "admin" | "agent",
      status: "invited",
    }).returning();

    res.status(201).json(member);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to invite team member" });
  }
});

router.patch("/members/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { role, status } = req.body;
    const updates: Partial<typeof teamMembersTable.$inferSelect> = { updatedAt: new Date() };
    if (role) updates.role = role;
    if (status) updates.status = status;

    const [updated] = await db.update(teamMembersTable).set(updates)
      .where(and(eq(teamMembersTable.id, req.params.id), eq(teamMembersTable.storeId, storeId!)))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update team member" });
  }
});

router.delete("/members/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await db.delete(teamMembersTable).where(and(eq(teamMembersTable.id, req.params.id), eq(teamMembersTable.storeId, storeId!)));
    res.json({ success: true, message: "Team member removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to remove team member" });
  }
});

export default router;
