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
import { getProductFromAdRef, buildAdProductPrompt } from "../lib/ad-product-lookup.js";
import { analyzeImage } from "../lib/analyze-image.js";
import { rehostImage } from "../lib/rehost-image.js";

export const whatsappRouter = Router();

// ─── Helper: resolve storeId from request ─────────────────────────────────────
async function resolveStoreId(req: any): Promise<string | null> {
  if (req.user?.storeId) return req.user.storeId;
  if (req.user?.id) {
    const { rows } = await pool.query(
      `SELECT store_id FROM users WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    return rows[0]?.store_id ?? null;
  }
  return null;
}

// ─── Webhook Verification ─────────────────────────────────────────────────────
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
  const storeId = await resolveStoreId(req);
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
    console.log(`[WhatsApp] Connected store ${storeId} with phoneNumberId ${phoneNumberId}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[WhatsApp] Connect error:", err);
    res.status(500).json({ error: "Failed to connect" });
  }
});

// ─── Disconnect WhatsApp ──────────────────────────────────────────────────────
whatsappRouter.post("/disconnect", requireAuth, async (req, res) => {
  const storeId = await resolveStoreId(req);
  if (!storeId) { res.status(400).json({ error: "No store" }); return; }
  try {
    await pool.query(
      `UPDATE channel_connections SET status = 'disconnected', access_token = NULL, updated_at = NOW() WHERE store_id = $1 AND channel = 'whatsapp'`,
      [storeId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to disconnect" });
  }
});

// ─── Webhook Incoming Messages ────────────────────────────────────────────────
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

// ─── Process Incoming Message ─────────────────────────────────────────────────
async function processIncomingWhatsAppMessage(incoming: {
  phoneNumberId: string;
  from: string;
  messageId: string;
  text: string;
  timestamp: Date;
  adRef?: string | null;
  isAudio?: boolean;
  imageMediaId?: string;
  profileName?: string | null;
}) {
  // 1. Find channel
  const { rows: channelRows } = await pool.query(
    `SELECT *, access_token as "accessToken", external_account_id as "externalAccountId", store_id as "storeId", webhook_secret as "webhookSecret" FROM channel_connections WHERE channel = 'whatsapp' AND external_account_id = $1 AND status = 'connected' LIMIT 1`,
    [incoming.phoneNumberId]
  );
  const channel = channelRows[0];
  if (!channel) {
    console.warn(`[WhatsApp] No connected channel for phoneNumberId: ${incoming.phoneNumberId}`);
    return;
  }

  // Echo guard: if message is FROM our own number, save as agent message and stop
  const ourPhoneNumber = channel.externalAccountId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (incoming.from === ourPhoneNumber) {
    const customer = await db.select().from(customersTable)
      .where(eq(customersTable.storeId, channel.storeId))
      .limit(1).then(r => r[0] ?? null);
    if (customer) {
      const conv = await db.select().from(conversationsTable)
        .where(and(eq(conversationsTable.storeId, channel.storeId), eq(conversationsTable.channel, "whatsapp")))
        .limit(1).then(r => r[0] ?? null);
      if (conv && incoming.messageId) {
        const { rows: dup } = await pool.query(`SELECT id FROM messages WHERE external_id = $1 LIMIT 1`, [incoming.messageId]);
        if (dup.length === 0) {
          await db.insert(messagesTable).values({
            id: generateId("msg"), conversationId: conv.id, content: incoming.text,
            sender: "agent", externalId: incoming.messageId,
            metadata: { source: "whatsapp_echo" }, createdAt: incoming.timestamp,
          });
          console.log(`[WhatsApp] Echo saved for conv ${conv.id}`);
        }
      }
    }
    return;
  }

  // 2. Load store
  const { rows: storeRows } = await pool.query(
    `SELECT *, ai_enabled as "aiEnabled", ai_system_prompt as "aiSystemPrompt" FROM stores WHERE id = $1 LIMIT 1`,
    [channel.storeId]
  );
  const store = storeRows[0];
  if (!store) return;

  // 3. Find or create customer
  let customer = await db.select().from(customersTable)
    .where(and(eq(customersTable.storeId, store.id), eq(customersTable.phone, incoming.from)))
    .limit(1).then((r) => r[0] ?? null);

  if (!customer) {
    const customerId = generateId("cust");
    await db.insert(customersTable).values({
      id: customerId, storeId: store.id, phone: incoming.from,
      name: incoming.profileName || incoming.from, createdAt: new Date(), updatedAt: new Date(),
    });
    customer = await db.select().from(customersTable)
      .where(eq(customersTable.id, customerId)).limit(1).then((r) => r[0]);
  } else if (incoming.profileName && customer.name === incoming.from) {
    // Customer was created before their WhatsApp display name was known —
    // self-heal now that Meta sent it in this message's `contacts` block.
    await pool.query(
      `UPDATE customers SET name = $1, updated_at = NOW() WHERE id = $2 AND name = $3`,
      [incoming.profileName, customer.id, incoming.from]
    );
    customer = { ...customer, name: incoming.profileName };
  }

  // 4. Find or create conversation
  const { rows: convFindRows } = await pool.query(
    `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE store_id = $1 AND channel = 'whatsapp' AND customer_id = $2 AND status = 'open' ORDER BY created_at ASC LIMIT 1`,
    [store.id, customer!.id]
  );
  let conversation = convFindRows[0] ?? null;

  if (!conversation) {
    const convId = generateId("conv");
    const meta = (channel.metadata ?? {}) as Record<string, unknown>;
    const defaultMode = meta.defaultAiMode as string | undefined;
    const aiMode = (defaultMode === "ai_autopilot" && store.aiEnabled) ? "ai_autopilot" : "human";
    await db.insert(conversationsTable).values({
      id: convId, storeId: store.id, customerId: customer!.id,
      customerName: customer!.name ?? incoming.from,
      channel: "whatsapp", status: "open", aiMode,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const { rows: convRows } = await pool.query(
      `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE id = $1 LIMIT 1`,
      [convId]
    );
    conversation = convRows[0];
  } else if (incoming.profileName && conversation.customerName === incoming.from) {
    await pool.query(
      `UPDATE conversations SET customer_name = $1 WHERE id = $2`,
      [incoming.profileName, conversation.id]
    );
    conversation.customerName = incoming.profileName;
  }
  if (!conversation) return;

  // 5. Dedup
  const existing = await db.select().from(messagesTable)
    .where(eq(messagesTable.externalId, incoming.messageId)).limit(1).then((r) => r[0] ?? null);
  if (existing) return;

  // 6. Save message
  const msgId = generateId("msg");

  // Resolve WhatsApp image media ID → download URL via Graph API, then analyze
  let msgMetadata: Record<string, unknown> | undefined;
  let msgContent = incoming.text;
  let imageUsedVision = false;
  if (incoming.imageMediaId) {
    try {
      const accessToken = channel.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
      const mediaRes = await fetch(
        `https://graph.facebook.com/v19.0/${incoming.imageMediaId}?access_token=${accessToken}`
      );
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json() as any;
        if (mediaData.url) {
          const analysis = await analyzeImage(mediaData.url, accessToken, store.id);
          msgContent = analysis.description;
          imageUsedVision = analysis.usedVision;
          // WhatsApp's media URL requires a Bearer header and expires quickly —
          // a plain <img src> can never load it. Re-host on Cloudinary once so
          // Inbox can actually display it.
          const rehostedUrl = await rehostImage(mediaData.url, accessToken);
          if (rehostedUrl) {
            msgMetadata = { type: "image", imageUrl: rehostedUrl, description: analysis.description };
          } else {
            console.error("[WhatsApp] Re-host failed — image won't be viewable in Inbox");
          }
          console.log(`[WhatsApp] Image analyzed (vision=${imageUsedVision}): ${msgContent.substring(0, 80)}`);
        }
      }
    } catch (err) {
      console.error("[WhatsApp] Failed to resolve/analyze image:", err);
    }
  }

  await db.insert(messagesTable).values({
    id: msgId, conversationId: conversation.id, content: msgContent,
    sender: "customer", externalId: incoming.messageId, createdAt: incoming.timestamp,
    metadata: msgMetadata,
  });

  await db.update(conversationsTable).set({
    lastMessage: msgContent,
    unreadCount: (conversation.unreadCount ?? 0) + 1,
    updatedAt: new Date(),
  }).where(eq(conversationsTable.id, conversation.id));

  console.log(`[WhatsApp] Message saved: conv=${conversation.id}${incoming.adRef ? ` adRef=${incoming.adRef}` : ""}${incoming.imageMediaId ? " (image)" : ""}`);

  // 7. Socket event
  try {
    const { getIO } = await import("../socket.js");
    const io = getIO();
    io.to(`store:${store.id}`).emit("new_conversation_message", {
      conversationId: conversation.id, storeId: store.id,
    });
  } catch {}

  // 7b. Voice message — send friendly reply, escalate to human, skip AI
  if (incoming.isAudio) {
    const accessToken = channel.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    const phoneNumberId = channel.externalAccountId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
    await sendWhatsAppMessage(phoneNumberId, accessToken, incoming.from,
      "🎤 واه سمعناك — ما نقدرش نقرا الرسايل الصوتية. كتب طلبك هنا ونردو عليك قريب 🙏"
    );
    const { escalateConversation } = await import("../lib/automation-engine.js");
    await escalateConversation(store.id, conversation.id, conversation.customerName ?? incoming.from);
    console.log(`[WhatsApp] Voice message — escalated to human: conv=${conversation.id}`);
    return;
  }

  // 8. AI reply
  if (conversation.aiMode === "ai_autopilot" && store.aiEnabled) {
    const accessToken = channel.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    const phoneNumberId = channel.externalAccountId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";

    const rawProducts = await db.select().from(productsTable)
      .where(and(eq(productsTable.storeId, store.id), eq(productsTable.isActive, true)));

    const products = rawProducts.map((p) => ({
      ...p,
      price: parseFloat(String(p.price)) || 0,
      stock: p.stock ?? 0,
      imageUrl: p.imageUrl ?? undefined,
      description: p.description ?? undefined,
    }));

    const recentOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.storeId, store.id))
      .orderBy(desc(ordersTable.createdAt)).limit(20);

    // ─── Ad referral: focus AI on specific product from ad ────────────────────
    const adProduct = await getProductFromAdRef(store.id, incoming.adRef);
    const aiSystemPromptWithAd = buildAdProductPrompt(store.aiSystemPrompt ?? undefined, adProduct);

    if (adProduct) {
      console.log(`[WhatsApp] Ad referral matched product: "${adProduct.name}" for store ${store.id}`);
    }

   // ── Generate run ID for ai_runs tracking ─────────────────────────────────
    const aiRunId = generateId("run");

    await callAiBridge({
      messageId: msgId,
      conversationId: conversation.id,
      storeId: store.id,
      storeName: store.name,
      aiSystemPrompt: aiSystemPromptWithAd,
      products,
      recentOrders,
      emitNewMessage: async (_convId, _sId, _replyMsgId, replyText) => {
        const handoffKeywords = ["agent humain", "transfer", "hand off", "n3awd nwasl", "ndir transfer", "responsable"];
        const isHandoff = handoffKeywords.some((kw) => replyText.toLowerCase().includes(kw));
        if (isHandoff) {
          await handleHumanHandoff(store.id, store.name, conversation.id, incoming.from);
        }
        await sendWhatsAppMessage(phoneNumberId, accessToken, incoming.from, replyText);
        console.log(`[WhatsApp] AI reply sent to ${incoming.from}`);
      },
      consumeCredits: async () => {
        const credits = imageUsedVision ? 2 : 1;
        try {
          await pool.query(
            `UPDATE subscriptions
             SET ai_credits_used_current_period = ai_credits_used_current_period + $2,
                 updated_at = NOW()
             WHERE organization_id = (
               SELECT organization_id FROM stores WHERE id = $1
             )`,
            [store.id, credits]
          );
          await pool.query(
            `INSERT INTO ai_runs
               (id, store_id, conversation_id, credits_charged, status, created_at)
             VALUES ($1, $2, $3, $4, 'success', NOW())`,
            [aiRunId, store.id, conversation.id, credits]
          );
        } catch (err) {
          console.error("[Credits] Failed to consume credits:", err);
        }
      },
      checkCredits: async () => {
        const status = await getAiStatus(store.id);
        return status.eligible;
      },
    });                  // closes callAiBridge({
  }                      // closes if (conversation.aiMode === "ai_autopilot" && store.aiEnabled)
}                        // closes outer handler function
// ─── Send Email via Resend ────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) { console.warn("[Email] RESEND_API_KEY not set"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "FlyChat <notifications@flychatcod.store>", to: [to], subject, html }),
  });
  if (!res.ok) console.error("[Email] Failed to send:", await res.text());
  else console.log(`[Email] Sent to ${to}`);
}

// ─── Human Handoff ────────────────────────────────────────────────────────────
async function handleHumanHandoff(storeId: string, storeName: string, conversationId: string, customerPhone: string) {
  try {
    await db.update(conversationsTable).set({ aiMode: "human", updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));

    const activeAgents = await db.select({ id: teamMembersTable.id, name: teamMembersTable.name, email: teamMembersTable.email })
      .from(teamMembersTable)
      .where(and(eq(teamMembersTable.storeId, storeId), eq(teamMembersTable.status, "active")));

    const inboxUrl = `https://flychatcod.store/inbox/${conversationId}`;

    for (const agent of activeAgents) {
      if (!agent.email) continue;
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">🔔 FlyChat — Human Agent Requested</h2>
          <p>A customer is requesting to speak with a human agent on <strong>${storeName}</strong>.</p>
          <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
            <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Customer Phone</td><td style="padding: 8px;">${customerPhone}</td></tr>
            <tr><td style="padding: 8px; background: #f3f4f6; font-weight: bold;">Conversation ID</td><td style="padding: 8px;">${conversationId}</td></tr>
          </table>
          <a href="${inboxUrl}" style="display:inline-block; background:#2563eb; color:white; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:bold;">Open Conversation</a>
        </div>`;
      await sendEmail(agent.email, `🔔 ${storeName} — Customer requesting human agent`, html);
    }
  } catch (err) {
    console.error("[WhatsApp] Human handoff error:", err);
  }
}