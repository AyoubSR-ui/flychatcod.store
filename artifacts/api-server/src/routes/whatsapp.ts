import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  customersTable,
  productsTable,
  ordersTable,
  teamMembersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import {
  parseWhatsAppWebhook,
  sendWhatsAppMessage,
  type WhatsAppWebhookPayload,
} from "../lib/whatsapp-service.js";
import { callAiBridge } from "../lib/ai-agent-bridge.js";
import { requireAuth } from "../middlewares/auth.js";
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

// ─── Connect WhatsApp ─────────────────────────────────────────────────────────
whatsappRouter.post("/connect", requireAuth, async (req, res) => {
  const storeId = req.user?.storeId;
  if (!storeId) { res.status(400).json({ error: "No store" }); return; }
  const { accessToken, phoneNumberId } = req.body;
  if (!accessToken) { res.status(400).json({ error: "accessToken required" }); return; }
  try {
    const { rows: existing } = await pool.query(
      `SELECT id FROM channel_connections WHERE store_id = $1 AND channel = 'whatsapp' LIMIT 1`,
      [storeId]
    );
    if (existing.length > 0) {
      await pool.query(
        `UPDATE channel_connections SET status = 'connected', access_token = $1, external_account_id = $2, updated_at = NOW() WHERE store_id = $3 AND channel = 'whatsapp'`,
        [accessToken, phoneNumberId || null, storeId]
      );
    } else {
      await pool.query(
        `INSERT INTO channel_connections (id, store_id, channel, status, access_token, external_account_id, created_at, updated_at) VALUES ($1, $2, 'whatsapp', 'connected', $3, $4, NOW(), NOW())`,
        [generateId("ch"), storeId, accessToken, phoneNumberId || null]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error("[WhatsApp] Connect error:", err);
    res.status(500).json({ error: "Failed to connect" });
  }
});

// ─── Disconnect WhatsApp ──────────────────────────────────────────────────────
whatsappRouter.post("/disconnect", requireAuth, async (req, res) => {
  const storeId = req.user?.storeId;
  if (!storeId) { res.status(400).json({ error: "No store" }); return; }
  await pool.query(
    `UPDATE channel_connections SET status = 'disconnected', access_token = NULL, updated_at = NOW() WHERE store_id = $1 AND channel = 'whatsapp'`,
    [storeId]
  );
  res.json({ success: true });
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

  // 1. Find channel by phoneNumberId
  const { rows: debugRows } = await pool.query(
    `SELECT COUNT(*) as total FROM channel_connections`
  );
  console.log("[WhatsApp] Total channel_connections rows:", debugRows[0].total);

  const { rows: channelRows } = await pool.query(
    `SELECT *, access_token as "accessToken", external_account_id as "externalAccountId", store_id as "storeId", webhook_secret as "webhookSecret" FROM channel_connections WHERE channel = 'whatsapp' AND external_account_id = $1 AND status = 'connected' LIMIT 1`,
    [incoming.phoneNumberId]
  );
  console.log("[WhatsApp] Raw SQL result:", JSON.stringify(channelRows));
  const channel = channelRows[0];

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
  const { rows: convFindRows } = await pool.query(
    `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE store_id = $1 AND channel = 'whatsapp' AND customer_id = $2 AND status = 'open' ORDER BY created_at ASC LIMIT 1`,
    [store.id, customer!.id]
  );
  let conversation = convFindRows[0] ?? null;

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
    const { rows: convRows } = await pool.query(
      `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE id = $1 LIMIT 1`,
      [convId]
    );
    conversation = convRows[0];
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
  console.log("[WhatsApp] AI check - aiMode:", conversation.aiMode, "aiEnabled:", store.aiEnabled, "accessToken:", !!channel.accessToken);

  if (conversation.aiMode === "ai_autopilot" && store.aiEnabled) {
    const accessToken = channel.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    const phoneNumberId = channel.externalAccountId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

    // Fetch products — price comes as string from DB, convert to number for AI bridge
    const rawProducts = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.storeId, store.id));

    const products = rawProducts.map((p) => ({
      ...p,
      price: parseFloat(String(p.price)) || 0,
      stock: p.stock ?? 0,
    }));

    // Fetch recent orders
    const recentOrders = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.storeId, store.id))
      .orderBy(desc(ordersTable.createdAt))
      .limit(20);

    console.log(`[WhatsApp] Passing ${products.length} products and ${recentOrders.length} orders to AI`);

    await callAiBridge({
      messageId: msgId,
      conversationId: conversation.id,
      storeId: store.id,
      storeName: store.name,
      aiSystemPrompt: store.aiSystemPrompt ?? undefined,
      products,
      recentOrders,
      emitNewMessage: async (_convId, _sId, _replyMsgId, replyText) => {
        // Detect human handoff keywords in AI reply
        const handoffKeywords = [
          "agent humain", "transfer", "hand off",
          "n3awd nwasl", "ndir transfer", "responsable"
        ];
        const isHandoff = handoffKeywords.some((kw) =>
          replyText.toLowerCase().includes(kw)
        );

        if (isHandoff) {
          await handleHumanHandoff(
            store.id,
            store.name,
            conversation.id,
            incoming.from
          );
        }

        await sendWhatsAppMessage(phoneNumberId, accessToken, incoming.from, replyText);
        console.log(`[WhatsApp] AI reply sent to ${incoming.from}`);
      },
      consumeCredits: async () => {
        // Credit tracking handled by external agent
      },
      checkCredits: async () => {
        const status = await getAiStatus(store.id);
        return status.eligible;
      },
    });
  }
}

// Send email via Resend
async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("[Email] RESEND_API_KEY not set, skipping email");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FlyChat <notifications@flychatcod.store>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[Email] Failed to send:", err);
  } else {
    console.log(`[Email] Sent to ${to}`);
  }
}

// Human handoff — switch to human mode + email all active agents
async function handleHumanHandoff(
  storeId: string,
  storeName: string,
  conversationId: string,
  customerPhone: string
) {
  try {
    console.log(`[WhatsApp] Human handoff for conv: ${conversationId}`);

    // Switch conversation to human mode
    await db
      .update(conversationsTable)
      .set({ aiMode: "human", updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));

    // Get all active team members for this store
    const activeAgents = await db
      .select({
        id: teamMembersTable.id,
        name: teamMembersTable.name,
        email: teamMembersTable.email,
      })
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.storeId, storeId),
          eq(teamMembersTable.status, "active")
        )
      );

    console.log(`[WhatsApp] Found ${activeAgents.length} active agents to notify`);

    const inboxUrl = `https://flychatcod.store/inbox/${conversationId}`;

    for (const agent of activeAgents) {
      if (!agent.email) continue;

      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🔔 FlyChat — Human Agent Requested</h2>
          <p>A customer is requesting to speak with a human agent on <strong>${storeName}</strong>.</p>
          <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Customer Phone</td>
              <td style="padding: 8px;">${customerPhone}</td>
            </tr>
            <tr>
              <td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Conversation ID</td>
              <td style="padding: 8px;">${conversationId}</td>
            </tr>
          </table>
          <a href="${inboxUrl}" style="display:inline-block; background:#2563eb; color:white; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">
            Open Conversation
          </a>
          <p style="color:#6b7280; font-size:12px; margin-top:24px;">FlyChat COD — AI Customer Support</p>
        </div>
      `;

      await sendEmail(
        agent.email,
        `🔔 ${storeName} — Customer requesting human agent`,
        html
      );
    }
  } catch (err) {
    console.error("[WhatsApp] Human handoff error:", err);
  }
}
