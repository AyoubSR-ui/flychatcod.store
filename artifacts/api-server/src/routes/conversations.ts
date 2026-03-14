import { Router } from "express";
import { db, conversationsTable, messagesTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { getIO } from "../socket.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ conversations: [], total: 0, page: 1, limit: 20 }); return; }

    const { status, search, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(conversationsTable.storeId, storeId)];
    if (status && ["open", "closed", "pending", "archived"].includes(status)) {
      conditions.push(eq(conversationsTable.status, status as any));
    }
    if (search) {
      conditions.push(ilike(conversationsTable.customerName, `%${search}%`));
    }

    const conversations = await db.select().from(conversationsTable)
      .where(and(...conditions))
      .orderBy(sql`${conversationsTable.updatedAt} desc`)
      .limit(limitNum).offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(conversationsTable).where(and(...conditions));

    res.json({ conversations, total: Number(total), page: pageNum, limit: limitNum });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch conversations" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { customerName, customerPhone, channel = "widget", initialMessage } = req.body;
    if (!customerName) {
      res.status(400).json({ error: "validation_error", message: "customerName is required" });
      return;
    }

    const convId = generateId("conv");
    const [conv] = await db.insert(conversationsTable).values({
      id: convId,
      storeId,
      customerName,
      customerPhone,
      channel: channel as any,
      lastMessage: initialMessage || null,
    }).returning();

    if (initialMessage) {
      await db.insert(messagesTable).values({
        id: generateId("msg"),
        conversationId: convId,
        content: initialMessage,
        sender: "customer",
        isInternal: 0,
      });
    }

    res.status(201).json(conv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create conversation" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const [conv] = await db.select().from(conversationsTable)
      .where(and(eq(conversationsTable.id, req.params.id), eq(conversationsTable.storeId, storeId!))).limit(1);

    if (!conv) { res.status(404).json({ error: "not_found", message: "Conversation not found" }); return; }

    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(messagesTable.createdAt);

    res.json({ ...conv, messages, customer: null, relatedOrders: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch conversation" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { status, assignedToId, tags } = req.body;
    const updates: Partial<typeof conversationsTable.$inferSelect> = {};
    if (status) updates.status = status;
    if (assignedToId !== undefined) updates.assignedToId = assignedToId;
    if (tags) updates.tags = tags;

    const [updated] = await db.update(conversationsTable).set(updates)
      .where(and(eq(conversationsTable.id, req.params.id), eq(conversationsTable.storeId, storeId!)))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Conversation not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update conversation" });
  }
});

router.get("/:id/messages", requireAuth, async (req, res) => {
  try {
    const messages = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, req.params.id))
      .orderBy(messagesTable.createdAt);
    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch messages" });
  }
});

router.post("/:id/messages", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { content, isInternal = false, attachment } = req.body;
    if (!content) {
      res.status(400).json({ error: "validation_error", message: "content is required" });
      return;
    }

    const msgId = generateId("msg");
    const metadata = attachment ? { attachment } : undefined;
    const [msg] = await db.insert(messagesTable).values({
      id: msgId,
      conversationId: req.params.id,
      content,
      sender: "agent",
      senderId: user.id,
      senderName: user.name,
      isInternal: isInternal ? 1 : 0,
      metadata,
    }).returning();

    await db.update(conversationsTable).set({ lastMessage: content, updatedAt: new Date() })
      .where(eq(conversationsTable.id, req.params.id));

    const responseMsg = { ...msg, isInternal: msg.isInternal === 1 };

    if (!isInternal) {
      try {
        const io = getIO();
        io.to(`conv:${req.params.id}`).emit("new_message", {
          conversationId: req.params.id,
          message: { id: msg.id, content: msg.content, sender: msg.sender, createdAt: msg.createdAt },
        });
      } catch {}
    }

    res.status(201).json(responseMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to send message" });
  }
});

export default router;
