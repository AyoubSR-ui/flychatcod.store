import { Router } from "express";
import { db, storesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/store", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.storeId) {
      res.status(404).json({ error: "not_found", message: "No store found" });
      return;
    }

    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, user.storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    res.json({
      id: store.id,
      name: store.name,
      description: store.description,
      phone: store.phone,
      logoUrl: store.logoUrl,
      websiteUrl: store.websiteUrl,
      defaultLanguage: store.defaultLanguage,
      widgetLanguage: store.widgetLanguage,
      shippingWilayas: store.shippingWilayas || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch store settings" });
  }
});

router.patch("/store", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { name, description, phone, logoUrl, websiteUrl, defaultLanguage, widgetLanguage, shippingWilayas } = req.body;
    const updates: Partial<typeof storesTable.$inferSelect> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (phone !== undefined) updates.phone = phone;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
    if (defaultLanguage) updates.defaultLanguage = defaultLanguage;
    if (widgetLanguage) updates.widgetLanguage = widgetLanguage;
    if (shippingWilayas) updates.shippingWilayas = shippingWilayas;

    const [updated] = await db.update(storesTable).set(updates)
      .where(eq(storesTable.id, user.storeId))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    // Update user language preference if changed
    if (defaultLanguage) {
      await db.update(usersTable).set({ language: defaultLanguage }).where(eq(usersTable.id, user.id));
    }

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      phone: updated.phone,
      logoUrl: updated.logoUrl,
      websiteUrl: updated.websiteUrl,
      defaultLanguage: updated.defaultLanguage,
      widgetLanguage: updated.widgetLanguage,
      shippingWilayas: updated.shippingWilayas || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update store settings" });
  }
});

router.get("/ai", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "owner" && user.role !== "admin") {
      res.status(403).json({ error: "forbidden", message: "Only owners and admins can view AI settings" });
      return;
    }
    if (!user.storeId) {
      res.status(404).json({ error: "not_found", message: "No store found" });
      return;
    }

    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, user.storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    res.json({
      aiEnabled: store.aiEnabled,
      aiSystemPrompt: store.aiSystemPrompt || "",
      aiFallbackToHuman: store.aiFallbackToHuman,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch AI settings" });
  }
});

router.patch("/ai", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "owner" && user.role !== "admin") {
      res.status(403).json({ error: "forbidden", message: "Only owners and admins can update AI settings" });
      return;
    }
    if (!user.storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { aiEnabled, aiSystemPrompt, aiFallbackToHuman } = req.body;
    const updates: Partial<typeof storesTable.$inferSelect> = { updatedAt: new Date() };
    if (typeof aiEnabled === "boolean") updates.aiEnabled = aiEnabled;
    if (typeof aiSystemPrompt === "string") updates.aiSystemPrompt = aiSystemPrompt;
    if (typeof aiFallbackToHuman === "boolean") updates.aiFallbackToHuman = aiFallbackToHuman;

    const [updated] = await db.update(storesTable).set(updates)
      .where(eq(storesTable.id, user.storeId))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    res.json({
      aiEnabled: updated.aiEnabled,
      aiSystemPrompt: updated.aiSystemPrompt || "",
      aiFallbackToHuman: updated.aiFallbackToHuman,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update AI settings" });
  }
});

export default router;
