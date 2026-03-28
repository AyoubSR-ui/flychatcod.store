import { Router } from "express";
import { db, automationRulesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

router.get("/rules", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ rules: [] }); return; }
    const rules = await db.select().from(automationRulesTable).where(eq(automationRulesTable.storeId, String(storeId)));
    res.json({ rules });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch automation rules" });
  }
});

router.post("/rules", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { name, trigger, action, isActive = true, config = {} } = req.body;
    if (!name || !trigger || !action) {
      res.status(400).json({ error: "validation_error", message: "name, trigger, and action are required" });
      return;
    }
    // ─── Plan automation limit check ──────────────────────────────────────
    const { getPlanLimits, planLimitError } = await import("../lib/plan-limits.js");
    const limits = await getPlanLimits(storeId);
    if (limits.automationRules === 0) {
  res.status(403).json(planLimitError("automation", limits.plan, "No automation rules"));
  return;
  }
    if (limits.automationRules !== -1) {
    const existing = await db.select().from(automationRulesTable).where(eq(automationRulesTable.storeId, String(storeId)));
    if (existing.length >= limits.automationRules) {
    res.status(403).json(planLimitError("automation", limits.plan, `${limits.automationRules} rules`));
    return;
    }
    }

    const [rule] = await db.insert(automationRulesTable).values({
      id: generateId("rule"),
      storeId,
      name,
      trigger,
      action,
      isActive,
      config,
    }).returning();

    res.status(201).json(rule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create automation rule" });
  }
});

router.patch("/rules/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { name, isActive, config } = req.body;
    const updates: Partial<typeof automationRulesTable.$inferSelect> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (isActive !== undefined) updates.isActive = isActive;
    if (config) updates.config = config;

    const [updated] = await db.update(automationRulesTable).set(updates)
      .where(and(eq(automationRulesTable.id, String(req.params.id)), eq(automationRulesTable.storeId, String(storeId))))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Rule not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update automation rule" });
  }
});

router.delete("/rules/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await db.delete(automationRulesTable).where(and(eq(automationRulesTable.id, String(req.params.id)), eq(automationRulesTable.storeId, String(storeId))));
    res.json({ success: true, message: "Rule deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to delete rule" });
  }
});

export default router;
