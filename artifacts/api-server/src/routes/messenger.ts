import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  conversationsTable,
  messagesTable,
  customersTable,
  productsTable,
  ordersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { callAiBridge } from "../lib/ai-agent-bridge.js";
import { getAiStatus } from "../lib/ai-credits.js";
import { requireAuth } from "../middlewares/auth.js";
import jwt from "jsonwebtoken";

export const messengerRouter = Router();

const FB_APP_ID = process.env.META_APP_ID || "";
const FB_APP_SECRET = process.env.META_APP_SECRET || "";
const FB_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "flychat-wa-2026";
const API_BASE = process.env.API_BASE_URL || "https://zealous-nature-production-771f.up.railway.app";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://flychatcodstore-production-a2e8.up.railway.app";

// Temporary state map for OAuth
const oauthStateMap = new Map<string, string>();

// ─── OAuth Start ──────────────────────────────────────────────────────────────
messengerRouter.get("/oauth/start", async (req, res) => {
  const queryToken = req.query.token as string;
  let storeId: string | undefined;

  if (queryToken) {
    try {
      const secret = process.env.JWT_SECRET || "";
     const decoded = jwt.verify(queryToken, secret) as any;
      storeId = decoded.storeId;
      if (!storeId && decoded.userId) {
      const { rows } = await pool.query(
     `SELECT store_id FROM users WHERE id = $1 LIMIT 1`,
     [decoded.userId]
    );
     storeId = rows[0]?.store_id; 
      }
    } catch (err) {
      console.error("[Messenger OAuth] Token verification failed:", err);
      res.status(401).json({ error: "invalid_token" });
      return;
    }
  } else {
    storeId = (req as any).user?.storeId;
  }

  if (!storeId) {
    res.status(400).json({ error: "No store found" });
    return;
  }

  const stateKey = generateId("st");
  oauthStateMap.set(stateKey, storeId);
  setTimeout(() => oauthStateMap.delete(stateKey), 10 * 60 * 1000);

  const CALLBACK_URL = `${API_BASE}/api/messenger/oauth/callback`;
  const params = new URLSearchParams({
    client_id: FB_APP_ID,
    redirect_uri: CALLBACK_URL,
    scope: "pages_messaging,pages_show_list,pages_read_engagement",
    response_type: "code",
    state: stateKey,
  });

  res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`);
});

// ─── OAuth Callback ───────────────────────────────────────────────────────────
messengerRouter.get("/oauth/callback", async (req, res) => {
  console.log("[Messenger OAuth] Callback received:", JSON.stringify(req.query));
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`${FRONTEND_URL}/channels?error=messenger_auth_failed`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${FRONTEND_URL}/channels?error=messenger_missing_params`);
    return;
  }

  const storeId = oauthStateMap.get(state);
  oauthStateMap.delete(state);

  if (!storeId) {
    console.error("[Messenger OAuth] No storeId for state:", state);
    res.redirect(`${FRONTEND_URL}/channels?error=messenger_missing_params`);
    return;
  }

  try {
    const CALLBACK_URL = `${API_BASE}/api/messenger/oauth/callback`;

    // Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      new URLSearchParams({
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: CALLBACK_URL,
        code,
      })
    );
    const tokenData = await tokenRes.json() as any;
    console.log("[Messenger OAuth] Token response:", JSON.stringify(tokenData));
    if (!tokenData.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);

    // Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        fb_exchange_token: tokenData.access_token,
      })
    );
    const longData = await longRes.json() as any;
    const userToken = longData.access_token || tokenData.access_token;

    // Get connected Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${userToken}`
    );
    const pagesData = await pagesRes.json() as any;
    const page = pagesData.data?.[0];
    if (!page) throw new Error("No Facebook Page found");

    const pageAccessToken = page.access_token;
    const pageId = page.id;
    const pageName = page.name;

    // Subscribe page to webhooks
    await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/subscribed_apps?access_token=${pageAccessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscribed_fields: ["messages", "messaging_postbacks"] }),
      }
    );

    console.log(`[Messenger OAuth] Connected Page ${pageId} (${pageName}) for store ${storeId}`);

    // Save to channel_connections
    const { rows: existing } = await pool.query(
      `SELECT id FROM channel_connections WHERE store_id = $1 AND channel = 'messenger' LIMIT 1`,
      [storeId]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE channel_connections SET status = 'connected', access_token = $1, external_account_id = $2, metadata = $3, updated_at = NOW() WHERE store_id = $4 AND channel = 'messenger'`,
        [pageAccessToken, pageId, JSON.stringify({ pageId, pageName }), storeId]
      );
    } else {
      await pool.query(
        `INSERT INTO channel_connections (id, store_id, channel, status, access_token, external_account_id, metadata, created_at, updated_at) VALUES ($1, $2, 'messenger', 'connected', $3, $4, $5, NOW(), NOW())`,
        [generateId("ch"), storeId, pageAccessToken, pageId, JSON.stringify({ pageId, pageName })]
      );
    }

    res.redirect(`${FRONTEND_URL}/channels?success=messenger_connected`);
  } catch (err) {
    console.error("[Messenger OAuth] Callback error:", err);
    res.redirect(`${FRONTEND_URL}/channels?error=messenger_setup_failed`);
  }
});

// ─── Webhook Verification ─────────────────────────────────────────────────────
messengerRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === FB_VERIFY_TOKEN) {
    console.log("[Messenger] Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

// ─── Webhook Incoming Messages ────────────────────────────────────────────────
messengerRouter.post("/webhook", async (req, res) => {
  res.status(200).send("OK");
  try {
    const body = req.body;
    if (body.object !== "page") return;
    for (const entry of body.entry || []) {
      const pageId = entry.id;
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;
        const text = event.message.text;
        if (!text) continue;
        await processIncomingMessengerMessage({
          pageId,
          senderId: event.sender.id,
          messageId: event.message.mid,
          text,
          timestamp: new Date(event.timestamp),
        }).catch(err => console.error("[Messenger] Processing error:", err));
      }
    }
  } catch (err) {
    console.error("[Messenger] Webhook error:", err);
  }
});

// ─── Disconnect ───────────────────────────────────────────────────────────────
messengerRouter.post("/disconnect", requireAuth, async (req, res) => {
  const storeId = req.user?.storeId;
  if (!storeId) { res.status(400).json({ error: "No store" }); return; }
  await pool.query(
    `UPDATE channel_connections SET status = 'disconnected', access_token = NULL, external_account_id = NULL, updated_at = NOW() WHERE store_id = $1 AND channel = 'messenger'`,
    [storeId]
  );
  res.json({ success: true });
});

// ─── Send Messenger Message ───────────────────────────────────────────────────
async function sendMessengerMessage(pageAccessToken: string, recipientId: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${pageAccessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      messaging_type: "RESPONSE",
    }),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    console.error("[Messenger] Send failed:", JSON.stringify(data));
    throw new Error(`Messenger send failed`);
  }
  return data;
}

// ─── Process Incoming Message ─────────────────────────────────────────────────
async function processIncomingMessengerMessage(incoming: {
  pageId: string;
  senderId: string;
  messageId: string;
  text: string;
  timestamp: Date;
}) {
  console.log(`[Messenger] Message from ${incoming.senderId} on page ${incoming.pageId}`);

  const { rows: channelRows } = await pool.query(
    `SELECT *, access_token as "accessToken", store_id as "storeId" FROM channel_connections WHERE channel = 'messenger' AND external_account_id = $1 AND status = 'connected' LIMIT 1`,
    [incoming.pageId]
  );
  const channel = channelRows[0];
  if (!channel) { console.warn(`[Messenger] No channel for page: ${incoming.pageId}`); return; }

  const { rows: storeRows } = await pool.query(
    `SELECT *, ai_enabled as "aiEnabled", ai_system_prompt as "aiSystemPrompt" FROM stores WHERE id = $1 LIMIT 1`,
    [channel.storeId]
  );
  const store = storeRows[0];
  if (!store) return;

  let customer = await db.select().from(customersTable)
    .where(and(eq(customersTable.storeId, store.id), eq(customersTable.phone, incoming.senderId)))
    .limit(1).then(r => r[0] ?? null);

  if (!customer) {
    const customerId = generateId("cust");
    await db.insert(customersTable).values({
      id: customerId, storeId: store.id, phone: incoming.senderId,
      name: "Messenger User", createdAt: new Date(), updatedAt: new Date(),
    });
    customer = await db.select().from(customersTable)
      .where(eq(customersTable.id, customerId)).limit(1).then(r => r[0]);
  }

  const { rows: convRows } = await pool.query(
    `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE store_id = $1 AND channel = 'messenger' AND customer_id = $2 AND status = 'open' ORDER BY created_at ASC LIMIT 1`,
    [store.id, customer!.id]
  );
  let conversation = convRows[0] ?? null;

  if (!conversation) {
    const convId = generateId("conv");
    await db.insert(conversationsTable).values({
      id: convId, storeId: store.id, customerId: customer!.id,
      customerName: "Messenger User", channel: "messenger", status: "open",
      aiMode: store.aiEnabled ? "ai_autopilot" : "human",
      createdAt: new Date(), updatedAt: new Date(),
    });
    const { rows: newRows } = await pool.query(
      `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE id = $1 LIMIT 1`,
      [convId]
    );
    conversation = newRows[0];
  }

  if (!conversation) return;

  const existing = await db.select().from(messagesTable)
    .where(eq(messagesTable.externalId, incoming.messageId)).limit(1).then(r => r[0] ?? null);
  if (existing) return;

  const msgId = generateId("msg");
  await db.insert(messagesTable).values({
    id: msgId, conversationId: conversation.id, content: incoming.text,
    sender: "customer", externalId: incoming.messageId, createdAt: incoming.timestamp,
  });

  await db.update(conversationsTable).set({
    lastMessage: incoming.text,
    unreadCount: (conversation.unreadCount ?? 0) + 1,
    updatedAt: new Date(),
  }).where(eq(conversationsTable.id, conversation.id));

  console.log(`[Messenger] Message saved: conv=${conversation.id}`);

  try {
    const { getIO } = await import("../socket.js");
    const io = getIO();
    io.to(`store:${store.id}`).emit("new_conversation_message", {
      conversationId: conversation.id,
      storeId: store.id,
    });
  } catch {}

  if (conversation.aiMode === "ai_autopilot" && store.aiEnabled) {
    const rawProducts = await db.select().from(productsTable).where(eq(productsTable.storeId, store.id));
    const products = rawProducts.map(p => ({ ...p, price: parseFloat(String(p.price)) || 0, stock: p.stock ?? 0 }));
    const recentOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.storeId, store.id))
      .orderBy(desc(ordersTable.createdAt)).limit(20);

    console.log(`[Messenger] Passing ${products.length} products and ${recentOrders.length} orders to AI`);

    await callAiBridge({
      messageId: msgId, conversationId: conversation.id,
      storeId: store.id, storeName: store.name,
      aiSystemPrompt: store.aiSystemPrompt ?? undefined,
      products, recentOrders,
      emitNewMessage: async (_c, _s, _r, replyText) => {
        await sendMessengerMessage(channel.accessToken, incoming.senderId, replyText);
        console.log(`[Messenger] AI reply sent to ${incoming.senderId}`);
      },
      consumeCredits: async () => {},
      checkCredits: async () => {
        const status = await getAiStatus(store.id);
        return status.eligible;
      },
    });
  }
}