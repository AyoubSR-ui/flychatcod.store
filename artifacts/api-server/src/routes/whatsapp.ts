import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  customersTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import {
  parseWhatsAppWebhook,
  sendWhatsAppMessage,
  type WhatsAppWebhookPayload,
} from "../lib/whatsapp-service.js";
import { callAiBridge } from "../lib/ai-agent-bridge.js";
import { getAiStatus } from "../lib/ai-credits.js";

export const whatsappRouter = Router();

// Webhook verification
whatsappRouter.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

// Incoming messages
whatsappRouter.post("/webhook", async (req, res) => {
  res.status(200).send("OK");

  try {
    const body = req.body as WhatsAppWebhookPayload;
    if (body.object !== "whatsapp_business_account") return;

    const incomingMessages = parseWhatsAppWebhook(body);

    for (const incoming of incomingMessages) {
      await processIncomingWhatsAppMessage(incoming).catch((err) =>
        console.error("[WhatsApp] Processing error:", err)
      );
    }
  } catch (err) {
    console.error("[WhatsApp] Webhook error:", err);
  }
});

async function processIncomingWhatsAppMessage(incoming: {
  phoneNumberId: string;
  from: string;
  messageId: string;
  text: string;
  timestamp: Date;
}) {
  console.log("[WhatsApp] Processing message from:", incoming.from);
  console.log("[WhatsApp] Looking for channel with phoneNumberId:", incoming.phoneNumberId);

  // 1. Find channel by phoneNumberId (stored in externalAccountId)
  const { rows: debugRows } = await pool.query(
    `SELECT COUNT(*) as total FROM channel_connections`
  );
  console.log("[WhatsApp] Total channel_connections rows:", debugRows[0].total);

  const { rows: channelRows } = await pool.query(
    `SELECT * FROM channel_connections WHERE channel = 'whatsapp' AND external_account_id = $1 LIMIT 1`,
    [incoming.phoneNumberId]
  );
  console.log("[WhatsApp] Raw SQL result:", JSON.stringify(channelRows));
  const channel = channelRows[0];

  console.log("[WhatsApp] Channel found:", channel);

  if (!channel) {
    console.warn(`[WhatsApp] No channel for phoneNumberId: ${incoming.phoneNumberId}`);
    return;
  }

  // 2. Load store
  const { rows: storeRows } = await pool.query(
  `SELECT *, ai_enabled as "aiEnabled", ai_system_prompt as "aiSystemPrompt" FROM stores WHERE id = $1 LIMIT 1`,
  [channel.store_id]
);
  const store = storeRows[0];

  console.log("[WhatsApp] Store found:", store?.id);

  if (!store) return;

  // 3. Find or create customer
  let customer = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.storeId, store.id),
        eq(customersTable.phone, incoming.from)
      )
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!customer) {
    const customerId = generateId("cust");
    await db.insert(customersTable).values({
      id: customerId,
      storeId: store.id,
      phone: incoming.from,
      name: incoming.from,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    customer = await db
      .select()
      .from(customersTable)
      .where(eq(customersTable.id, customerId))
      .limit(1)
      .then((r) => r[0]);
  }

  console.log("[WhatsApp] Customer found/created:", customer?.id);

  // 4. Find or create open conversation
  let conversation = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.storeId, store.id),
        eq(conversationsTable.channel, "whatsapp"),
        eq(conversationsTable.customerId, customer!.id),
        eq(conversationsTable.status, "open")
      )
    )
    .orderBy(conversationsTable.createdAt)
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!conversation) {
    const convId = generateId("conv");
    await db.insert(conversationsTable).values({
      id: convId,
      storeId: store.id,
      customerId: customer!.id,
      customerName: customer!.name ?? incoming.from,
      channel: "whatsapp",
      status: "open",
      aiMode: store.aiEnabled ? "ai_autopilot" : "human",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    conversation = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, convId))
      .limit(1)
      .then((r) => r[0]);
  }

  console.log("[WhatsApp] Conversation found/created:", conversation?.id);

  if (!conversation) return;

  // 5. Dedup check
  const existing = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.externalId, incoming.messageId))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (existing) return;

  // 6. Save message
  const msgId = generateId("msg");
  await db.insert(messagesTable).values({
    id: msgId,
    conversationId: conversation.id,
    content: incoming.text,
    sender: "customer",
    externalId: incoming.messageId,
    createdAt: incoming.timestamp,
  });

  await db
    .update(conversationsTable)
    .set({
      lastMessage: incoming.text,
      unreadCount: (conversation.unreadCount ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(conversationsTable.id, conversation.id));

  console.log("[WhatsApp] Message saved successfully");
  console.log(`[WhatsApp] Message saved: conv=${conversation.id}`);

  // 7. AI reply
  if (conversation.aiMode === "ai_autopilot" && store.aiEnabled) {
    const accessToken = channel.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    const phoneNumberId = channel.externalAccountId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

    await callAiBridge({
      messageId: msgId,
      conversationId: conversation.id,
      storeId: store.id,
      storeName: store.name,
      aiSystemPrompt: store.aiSystemPrompt ?? undefined,
      products: [],
      recentOrders: [],
      emitNewMessage: async (_convId, _sId, _replyMsgId, replyText) => {
        await sendWhatsAppMessage(
          phoneNumberId,
          accessToken,
          incoming.from,
          replyText
        );
        console.log(`[WhatsApp] AI reply sent to ${incoming.from}`);
      },
      consumeCredits: async () => {
        // Token counts not available here; credit tracking is handled by the external agent
      },
      checkCredits: async () => {
        const status = await getAiStatus(store.id);
        return status.eligible;
      },
    });
  }
}
