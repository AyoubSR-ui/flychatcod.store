import { Router } from "express";
import { db, widgetConfigsTable, conversationsTable, messagesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

router.get("/config", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(404).json({ error: "not_found", message: "No store found" }); return; }

    const [config] = await db.select().from(widgetConfigsTable).where(eq(widgetConfigsTable.storeId, storeId)).limit(1);
    if (!config) { res.status(404).json({ error: "not_found", message: "Widget config not found" }); return; }

    const embedCode = `<script>window.FLYCHAT_CONFIG={storeId:"${storeId}"};</script>\n<script src="https://your-domain.com/widget.js"></script>`;

    res.json({ ...config, embedCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch widget config" });
  }
});

router.patch("/config", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { welcomeMessageEn, welcomeMessageFr, defaultLanguage, primaryColor, position, isActive } = req.body;
    const updates: Partial<typeof widgetConfigsTable.$inferSelect> = { updatedAt: new Date() };
    if (welcomeMessageEn) updates.welcomeMessageEn = welcomeMessageEn;
    if (welcomeMessageFr) updates.welcomeMessageFr = welcomeMessageFr;
    if (defaultLanguage) updates.defaultLanguage = defaultLanguage;
    if (primaryColor) updates.primaryColor = primaryColor;
    if (position) updates.position = position;
    if (isActive !== undefined) updates.isActive = isActive;

    let [config] = await db.select().from(widgetConfigsTable).where(eq(widgetConfigsTable.storeId, storeId)).limit(1);

    if (config) {
      [config] = await db.update(widgetConfigsTable).set(updates).where(eq(widgetConfigsTable.storeId, storeId)).returning();
    } else {
      [config] = await db.insert(widgetConfigsTable).values({
        id: generateId("wgt"),
        storeId,
        ...updates as any,
      }).returning();
    }

    const embedCode = `<script>window.FLYCHAT_CONFIG={storeId:"${storeId}"};</script>\n<script src="https://your-domain.com/widget.js"></script>`;
    res.json({ ...config, embedCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update widget config" });
  }
});

router.get("/public/:storeId", async (req, res) => {
  try {
    const { storeId } = req.params;
    const [config] = await db.select().from(widgetConfigsTable).where(eq(widgetConfigsTable.storeId, storeId)).limit(1);
    if (!config) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    res.json({
      storeId: config.storeId,
      storeName: "Store",
      welcomeMessageEn: config.welcomeMessageEn,
      welcomeMessageFr: config.welcomeMessageFr,
      defaultLanguage: config.defaultLanguage,
      primaryColor: config.primaryColor,
      position: config.position,
      isActive: config.isActive,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch public widget config" });
  }
});

router.post("/conversation", async (req, res) => {
  try {
    const { storeId, customerName, customerPhone, initialMessage, language = "fr" } = req.body;
    if (!storeId || !customerName || !initialMessage) {
      res.status(400).json({ error: "validation_error", message: "storeId, customerName, and initialMessage are required" });
      return;
    }

    const convId = generateId("conv");
    await db.insert(conversationsTable).values({
      id: convId,
      storeId,
      customerName,
      customerPhone,
      channel: "widget",
      lastMessage: initialMessage,
      status: "open",
    });

    await db.insert(messagesTable).values({
      id: generateId("msg"),
      conversationId: convId,
      content: initialMessage,
      sender: "customer",
      isInternal: 0,
    });

    const token = `widget_${generateId()}`;
    res.status(201).json({ conversationId: convId, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to start conversation" });
  }
});

export default router;
