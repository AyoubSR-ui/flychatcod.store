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

export const instagramRouter = Router();

const IG_APP_ID = process.env.INSTAGRAM_APP_ID || "";
const IG_APP_SECRET = process.env.META_APP_SECRET_INSTAGRAM || "";
const IG_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "flychat-wa-2026";
const API_BASE = process.env.API_BASE_URL || "https://zealous-nature-production-771f.up.railway.app";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://flychatcodstore-production-a2e8.up.railway.app";

const oauthStateMap = new Map<string, string>();

// ─── OAuth Start ──────────────────────────────────────────────────────────────
instagramRouter.get("/oauth/start", async (req, res) => {
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
      console.error("[Instagram OAuth] Token verification failed:", err);
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

  const CALLBACK_URL = `${API_BASE}/api/instagram/oauth/callback`;
  const params = new URLSearchParams({
    force_reauth: "true",
    client_id: IG_APP_ID,
    redirect_uri: CALLBACK_URL,
    response_type: "code",
    scope: "instagram_business_basic,instagram_business_manage_messages",
    state: stateKey,
  });

  console.log("[Instagram OAuth] Start redirect_uri:", CALLBACK_URL);
  res.redirect(`https://www.instagram.com/oauth/authorize?${params.toString()}`);
});

// ─── OAuth Callback ───────────────────────────────────────────────────────────
instagramRouter.get("/oauth/callback", async (req, res) => {
  console.log("[Instagram OAuth] Callback received:", JSON.stringify(req.query));
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    res.redirect(`${FRONTEND_URL}/channels?error=instagram_auth_failed`);
    return;
  }
  if (!code || !state) {
    res.redirect(`${FRONTEND_URL}/channels?error=instagram_missing_params`);
    return;
  }

  const storeId = oauthStateMap.get(state);
  oauthStateMap.delete(state);

  if (!storeId) {
    console.error("[Instagram OAuth] No storeId for state:", state);
    res.redirect(`${FRONTEND_URL}/channels?error=instagram_missing_params`);
    return;
  }

  const CALLBACK_URL = `${API_BASE}/api/instagram/oauth/callback`;

  try {
    // Exchange code for short-lived token
    const tokenBody = new URLSearchParams({
      client_id: IG_APP_ID,
      client_secret: IG_APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: CALLBACK_URL,
      code,
    });

    const tokenRes = await fetch(`https://api.instagram.com/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });
    const tokenData = await tokenRes.json() as any;
    console.log("[Instagram OAuth] Token response:", JSON.stringify(tokenData));

    if (!tokenData.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);

    const shortToken = tokenData.access_token;

    // Exchange for long-lived token
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?` +
      new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: IG_APP_SECRET,
        access_token: shortToken,
      })
    );
    const longData = await longRes.json() as any;
    const accessToken = longData.access_token || shortToken;

    // NOTE: tokenData.user_id is app-scoped and does NOT match the webhook recipient ID.
    // We store "pending" here — the real Business Account ID is self-healed
    // on the first incoming webhook message (see processIncomingInstagramMessage).
    const appScopedId = String(tokenData.user_id || "pending");

    console.log(`[Instagram OAuth] Connected app-scoped ID ${appScopedId} for store ${storeId} — real ID will be set on first message`);

    // Save to channel_connections with pending external_account_id
    const { rows: existing } = await pool.query(
      `SELECT id FROM channel_connections WHERE store_id = $1 AND channel = 'instagram' LIMIT 1`,
      [storeId]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE channel_connections SET status = 'connected', access_token = $1, external_account_id = 'pending', metadata = $2, updated_at = NOW() WHERE store_id = $3 AND channel = 'instagram'`,
        [accessToken, JSON.stringify({ appScopedId, realIdPending: true }), storeId]
      );
    } else {
      await pool.query(
        `INSERT INTO channel_connections (id, store_id, channel, status, access_token, external_account_id, metadata, created_at, updated_at) VALUES ($1, $2, 'instagram', 'connected', $3, 'pending', $4, NOW(), NOW())`,
        [generateId("ch"), storeId, accessToken, JSON.stringify({ appScopedId, realIdPending: true })]
      );
    }

    res.redirect(`${FRONTEND_URL}/channels?success=instagram_connected`);
  } catch (err) {
    console.error("[Instagram OAuth] Callback error:", err);
    res.redirect(`${FRONTEND_URL}/channels?error=instagram_setup_failed`);
  }
});

// ─── Webhook Verification ─────────────────────────────────────────────────────
instagramRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === IG_VERIFY_TOKEN) {
    console.log("[Instagram] Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.status(403).send("Forbidden");
  }
});

// ─── Webhook Incoming Messages ────────────────────────────────────────────────
instagramRouter.post("/webhook", async (req, res) => {
  res.status(200).send("OK");
  try {
    const body = req.body;
    if (body.object !== "instagram") return;
    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;
        const text = event.message.text;
        if (!text) continue;
        await processIncomingInstagramMessage({
          igAccountId: event.recipient.id,  // ← real Business Account ID from webhook
          senderId: event.sender.id,
          messageId: event.message.mid,
          text,
          timestamp: new Date(event.timestamp),
        }).catch(err => console.error("[Instagram] Processing error:", err));
      }
    }
  } catch (err) {
    console.error("[Instagram] Webhook error:", err);
  }
});

// ─── Disconnect ───────────────────────────────────────────────────────────────
instagramRouter.post("/disconnect", requireAuth, async (req, res) => {
  const storeId = req.user?.storeId;
  if (!storeId) { res.status(400).json({ error: "No store" }); return; }
  await pool.query(
    `UPDATE channel_connections SET status = 'disconnected', access_token = NULL, external_account_id = NULL, metadata = NULL, updated_at = NOW() WHERE store_id = $1 AND channel = 'instagram'`,
    [storeId]
  );
  res.json({ success: true });
});

// ─── Send Instagram Message ───────────────────────────────────────────────────
async function sendInstagramMessage(accessToken: string, recipientId: string, text: string) {
  const res = await fetch(`https://graph.instagram.com/v18.0/me/messages?access_token=${accessToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  });
  const data = await res.json() as any;
  if (!res.ok) {
    console.error("[Instagram] Send failed:", JSON.stringify(data));
    throw new Error(`Instagram send failed`);
  }
  return data;
}

// ─── Process Incoming Message ─────────────────────────────────────────────────
async function processIncomingInstagramMessage(incoming: {
  igAccountId: string;  // real Business Account ID from webhook
  senderId: string;
  messageId: string;
  text: string;
  timestamp: Date;
}) {
  console.log(`[Instagram] Message from ${incoming.senderId} to account ${incoming.igAccountId}`);

  // Look up channel by:
  // 1. exact external_account_id match (already healed)
  // 2. pending (freshly connected, not yet healed)
  // 3. metadata appScopedId (legacy fallback)
  const { rows: channelRows } = await pool.query(
    `SELECT *, access_token as "accessToken", store_id as "storeId" 
     FROM channel_connections 
     WHERE channel = 'instagram' AND status = 'connected' 
     AND (external_account_id = $1 OR external_account_id = 'pending')
     LIMIT 1`,
    [incoming.igAccountId]
  );
  const channel = channelRows[0];

  if (!channel) {
    console.warn(`[Instagram] No connected channel for IG account: ${incoming.igAccountId}`);
    return;
  }

  // ─── Self-heal: fix external_account_id from webhook on first message ────────
  if (channel.external_account_id !== incoming.igAccountId) {
    await pool.query(
      `UPDATE channel_connections 
       SET external_account_id = $1, 
           metadata = metadata || $2::jsonb,
           updated_at = NOW() 
       WHERE id = $3`,
      [
        incoming.igAccountId,
        JSON.stringify({ realId: incoming.igAccountId, realIdPending: false }),
        channel.id,
      ]
    );
    console.log(`[Instagram] Self-healed: external_account_id → ${incoming.igAccountId}`);
  }

  // Load store
  const { rows: storeRows } = await pool.query(
    `SELECT *, ai_enabled as "aiEnabled", ai_system_prompt as "aiSystemPrompt" FROM stores WHERE id = $1 LIMIT 1`,
    [channel.storeId]
  );
  const store = storeRows[0];
  if (!store) return;

  // Find or create customer
  let customer = await db.select().from(customersTable)
    .where(and(eq(customersTable.storeId, store.id), eq(customersTable.phone, incoming.senderId)))
    .limit(1).then(r => r[0] ?? null);

  if (!customer) {
    const customerId = generateId("cust");
    await db.insert(customersTable).values({
      id: customerId, storeId: store.id, phone: incoming.senderId,
      name: "Instagram User", createdAt: new Date(), updatedAt: new Date(),
    });
    customer = await db.select().from(customersTable)
      .where(eq(customersTable.id, customerId)).limit(1).then(r => r[0]);
  }

  // Find or create open conversation
  const { rows: convRows } = await pool.query(
    `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" 
     FROM conversations 
     WHERE store_id = $1 AND channel = 'instagram' AND customer_id = $2 AND status = 'open' 
     ORDER BY created_at ASC LIMIT 1`,
    [store.id, customer!.id]
  );
  let conversation = convRows[0] ?? null;

  if (!conversation) {
    const convId = generateId("conv");
    const meta = (channel.metadata ?? {}) as Record<string, unknown>;
    const defaultMode = meta.defaultAiMode as string | undefined;
    const aiMode = (defaultMode === "ai_autopilot" && store.aiEnabled) ? "ai_autopilot" : "human";

    await db.insert(conversationsTable).values({
      id: convId, storeId: store.id, customerId: customer!.id,
      customerName: "Instagram User", channel: "instagram", status: "open",
      aiMode,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const { rows: newRows } = await pool.query(
      `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE id = $1 LIMIT 1`,
      [convId]
    );
    conversation = newRows[0];
  }

  if (!conversation) return;

  // Deduplicate messages
  const existing = await db.select().from(messagesTable)
    .where(eq(messagesTable.externalId, incoming.messageId)).limit(1).then(r => r[0] ?? null);
  if (existing) return;

  // Save message
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

  console.log(`[Instagram] Message saved: conv=${conversation.id}`);

  // Emit socket event
  try {
    const { getIO } = await import("../socket.js");
    const io = getIO();
    io.to(`store:${store.id}`).emit("new_conversation_message", {
      conversationId: conversation.id,
      storeId: store.id,
    });
  } catch {}

  // AI reply
  if (conversation.aiMode === "ai_autopilot" && store.aiEnabled) {
    const rawProducts = await db.select().from(productsTable).where(eq(productsTable.storeId, store.id));
    const products = rawProducts.map(p => ({ ...p, price: parseFloat(String(p.price)) || 0, stock: p.stock ?? 0 }));
    const recentOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.storeId, store.id))
      .orderBy(desc(ordersTable.createdAt)).limit(20);

    await callAiBridge({
      messageId: msgId, conversationId: conversation.id,
      storeId: store.id, storeName: store.name,
      aiSystemPrompt: store.aiSystemPrompt ?? undefined,
      products, recentOrders,
      emitNewMessage: async (_c, _s, _r, replyText) => {
        await sendInstagramMessage(channel.accessToken, incoming.senderId, replyText);
        console.log(`[Instagram] AI reply sent to ${incoming.senderId}`);
      },
      consumeCredits: async () => {},
      checkCredits: async () => {
        const status = await getAiStatus(store.id);
        return status.eligible;
      },
    });
  }
}