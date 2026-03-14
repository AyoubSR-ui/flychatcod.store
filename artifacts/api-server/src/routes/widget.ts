import { Router } from "express";
import { db, widgetConfigsTable, widgetSessionsTable, conversationsTable, messagesTable, storesTable } from "@workspace/db";
import type { InsertWidgetConfig } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { z } from "zod";

const router = Router();

router.get("/config", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(404).json({ error: "not_found", message: "No store found" }); return; }

    const [config] = await db.select().from(widgetConfigsTable).where(eq(widgetConfigsTable.storeId, storeId)).limit(1);
    if (!config) { res.status(404).json({ error: "not_found", message: "Widget config not found" }); return; }

    const embedCode = `<script>window.FLYCHAT_CONFIG={storeId:"${storeId}"};</script>\n<script src="/api/widget/widget.js"></script>`;

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
    const updates: Partial<Pick<InsertWidgetConfig, "welcomeMessageEn" | "welcomeMessageFr" | "defaultLanguage" | "primaryColor" | "position" | "isActive">> & { updatedAt: Date } = { updatedAt: new Date() };
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
      const insertValues: InsertWidgetConfig = {
        id: generateId("wgt"),
        storeId,
        welcomeMessageEn: updates.welcomeMessageEn,
        welcomeMessageFr: updates.welcomeMessageFr,
        defaultLanguage: updates.defaultLanguage,
        primaryColor: updates.primaryColor,
        position: updates.position,
        isActive: updates.isActive,
      };
      [config] = await db.insert(widgetConfigsTable).values(insertValues).returning();
    }

    const embedCode = `<script>window.FLYCHAT_CONFIG={storeId:"${storeId}"};</script>\n<script src="/api/widget/widget.js"></script>`;
    res.json({ ...config, embedCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update widget config" });
  }
});

router.get("/widget.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(WIDGET_LOADER_JS);
});

router.get("/public/config/:storeId", async (req, res) => {
  try {
    const { storeId } = req.params;

    const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    const [config] = await db.select().from(widgetConfigsTable).where(eq(widgetConfigsTable.storeId, storeId)).limit(1);
    if (!config || !config.isActive) { res.status(404).json({ error: "not_found", message: "Widget not found or inactive" }); return; }

    res.json({
      storeId: config.storeId,
      storeName: store.name,
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

const sessionSchema = z.object({
  storeId: z.string().min(1),
  visitorId: z.string().optional(),
  language: z.string().default("fr"),
  currentPageUrl: z.string().optional(),
  referrer: z.string().optional(),
});

router.post("/public/session", async (req, res) => {
  try {
    const parsed = sessionSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "validation_error", message: parsed.error.issues }); return; }
    const { storeId, language, currentPageUrl, referrer } = parsed.data;
    let visitorId = parsed.data.visitorId;

    const [store] = await db.select({ id: storesTable.id }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    if (visitorId) {
      const [existingSession] = await db.select()
        .from(widgetSessionsTable)
        .where(and(
          eq(widgetSessionsTable.storeId, storeId),
          eq(widgetSessionsTable.visitorId, visitorId),
        ))
        .orderBy(desc(widgetSessionsTable.createdAt))
        .limit(1);

      if (existingSession) {
        await db.update(widgetSessionsTable).set({
          lastSeenAt: new Date(),
          language,
          currentPageUrl: currentPageUrl || existingSession.currentPageUrl,
          referrer: referrer || existingSession.referrer,
        }).where(eq(widgetSessionsTable.id, existingSession.id));

        res.json({ visitorId, sessionId: existingSession.id, storeId, language });
        return;
      }
    }

    if (!visitorId) {
      visitorId = generateId("vis");
    }

    const sessionId = generateId("wsess");
    await db.insert(widgetSessionsTable).values({
      id: sessionId,
      storeId,
      visitorId,
      language,
      currentPageUrl: currentPageUrl || null,
      referrer: referrer || null,
      lastSeenAt: new Date(),
    });

    res.status(201).json({ visitorId, sessionId, storeId, language });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create session" });
  }
});

const createConvSchema = z.object({
  storeId: z.string().min(1),
  visitorId: z.string().min(1),
  language: z.string().default("fr"),
  currentPageUrl: z.string().optional(),
  referrer: z.string().optional(),
});

router.post("/public/conversations", async (req, res) => {
  try {
    const parsed = createConvSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "validation_error", message: parsed.error.issues }); return; }
    const { storeId, visitorId, language, currentPageUrl, referrer } = parsed.data;

    const existing = await db.select()
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.storeId, storeId),
        eq(conversationsTable.visitorId, visitorId),
        eq(conversationsTable.status, "open"),
      ))
      .orderBy(desc(conversationsTable.createdAt))
      .limit(1);

    if (existing.length > 0) {
      res.json({ conversationId: existing[0].id, status: existing[0].status, resumed: true });
      return;
    }

    const convId = generateId("conv");
    await db.insert(conversationsTable).values({
      id: convId,
      storeId,
      customerName: `Visitor ${visitorId.slice(-6)}`,
      visitorId,
      channel: "widget",
      status: "open",
      widgetLanguage: language,
      sourcePageUrl: currentPageUrl || null,
      referrer: referrer || null,
    });

    res.status(201).json({ conversationId: convId, status: "open", resumed: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create conversation" });
  }
});

router.get("/public/conversations/:conversationId/messages", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const visitorId = req.query.visitorId;
    const storeId = req.query.storeId;
    if (!visitorId || typeof visitorId !== "string") {
      res.status(400).json({ error: "validation_error", message: "visitorId query parameter is required" }); return;
    }
    if (!storeId || typeof storeId !== "string") {
      res.status(400).json({ error: "validation_error", message: "storeId query parameter is required" }); return;
    }

    const [conv] = await db.select({
      id: conversationsTable.id,
      visitorId: conversationsTable.visitorId,
      channel: conversationsTable.channel,
      storeId: conversationsTable.storeId,
    }).from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
    if (!conv) { res.status(404).json({ error: "not_found", message: "Conversation not found" }); return; }
    if (conv.channel !== "widget") {
      res.status(403).json({ error: "forbidden", message: "Not a widget conversation" }); return;
    }
    if (conv.storeId !== storeId) {
      res.status(403).json({ error: "forbidden", message: "Store mismatch" }); return;
    }
    if (!conv.visitorId || conv.visitorId !== visitorId) {
      res.status(403).json({ error: "forbidden", message: "Visitor mismatch" }); return;
    }

    const messages = await db.select({
      id: messagesTable.id,
      content: messagesTable.content,
      sender: messagesTable.sender,
      createdAt: messagesTable.createdAt,
    })
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch messages" });
  }
});

const sendMessageSchema = z.object({
  storeId: z.string().min(1),
  visitorId: z.string().min(1),
  content: z.string().transform(v => v.trim()).refine(v => v.length >= 1 && v.length <= 2000, {
    message: "Content must be between 1 and 2000 characters after trimming",
  }),
  language: z.string().optional(),
});

router.post("/public/conversations/:conversationId/messages", async (req, res) => {
  try {
    const { conversationId } = req.params;
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "validation_error", message: parsed.error.issues }); return; }
    const { storeId, visitorId, content } = parsed.data;

    const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
    if (!conv) { res.status(404).json({ error: "not_found", message: "Conversation not found" }); return; }
    if (conv.channel !== "widget") {
      res.status(403).json({ error: "forbidden", message: "Not a widget conversation" }); return;
    }
    if (conv.storeId !== storeId) {
      res.status(403).json({ error: "forbidden", message: "Store mismatch" }); return;
    }
    if (!conv.visitorId || conv.visitorId !== visitorId) {
      res.status(403).json({ error: "forbidden", message: "Visitor mismatch" }); return;
    }

    const msgId = generateId("msg");
    const now = new Date();
    await db.insert(messagesTable).values({
      id: msgId,
      conversationId,
      content,
      sender: "customer",
      isInternal: 0,
    });

    await db.update(conversationsTable).set({
      lastMessage: content,
      lastMessageAt: now,
      updatedAt: now,
      unreadCount: (conv.unreadCount || 0) + 1,
    }).where(eq(conversationsTable.id, conversationId));

    const [msg] = await db.select({
      id: messagesTable.id,
      content: messagesTable.content,
      sender: messagesTable.sender,
      createdAt: messagesTable.createdAt,
    }).from(messagesTable).where(eq(messagesTable.id, msgId));

    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to send message" });
  }
});

router.get("/public/:storeId", async (req, res) => {
  try {
    const { storeId } = req.params;

    const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    const [config] = await db.select().from(widgetConfigsTable).where(eq(widgetConfigsTable.storeId, storeId)).limit(1);
    if (!config) { res.status(404).json({ error: "not_found", message: "Widget config not found" }); return; }

    res.json({
      storeId: config.storeId,
      storeName: store.name,
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

const WIDGET_LOADER_JS = `(function(){
  if(window.__FlyChat) return;
  window.__FlyChat = { open: false, ready: false };

  var cfg = window.FLYCHAT_CONFIG || {};
  if(!cfg.storeId) { console.error("[FlyChat] Missing storeId in FLYCHAT_CONFIG"); return; }

  var storeId = cfg.storeId;
  var lang = cfg.lang || "fr";

  var scriptEl = document.currentScript;
  var baseUrl = "";
  if(scriptEl && scriptEl.src) {
    var srcUrl = new URL(scriptEl.src);
    baseUrl = srcUrl.origin;
  } else {
    baseUrl = window.location.origin;
  }

  var btn = document.createElement("div");
  btn.id = "flychat-launcher";
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>';
  btn.style.cssText = "position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:#2563eb;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:2147483646;box-shadow:0 4px 20px rgba(0,0,0,0.25);transition:transform 0.2s,background 0.3s;";

  var container = document.createElement("div");
  container.id = "flychat-container";
  container.style.cssText = "position:fixed;bottom:96px;right:24px;width:380px;height:560px;max-height:calc(100vh - 120px);border-radius:16px;overflow:hidden;z-index:2147483646;box-shadow:0 8px 40px rgba(0,0,0,0.2);display:none;";

  var iframe = document.createElement("iframe");
  iframe.src = baseUrl + "/embed/widget?storeId=" + encodeURIComponent(storeId) + "&lang=" + encodeURIComponent(lang);
  iframe.style.cssText = "width:100%;height:100%;border:none;border-radius:16px;";
  iframe.allow = "clipboard-write";
  container.appendChild(iframe);

  fetch(baseUrl + "/api/widget/public/config/" + encodeURIComponent(storeId))
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if(data && data.primaryColor) {
        btn.style.background = data.primaryColor;
      }
      window.__FlyChat.ready = true;
    })
    .catch(function() { window.__FlyChat.ready = true; });

  btn.addEventListener("click", function() {
    window.__FlyChat.open = !window.__FlyChat.open;
    container.style.display = window.__FlyChat.open ? "block" : "none";
    btn.style.transform = window.__FlyChat.open ? "scale(0.9)" : "scale(1)";
  });

  btn.addEventListener("mouseenter", function() { btn.style.transform = "scale(1.08)"; });
  btn.addEventListener("mouseleave", function() { if(!window.__FlyChat.open) btn.style.transform = "scale(1)"; });

  document.body.appendChild(container);
  document.body.appendChild(btn);
})();`;

export default router;
