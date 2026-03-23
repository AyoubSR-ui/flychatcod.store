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
import { callAiBridge } from "../lib/ai-agent-bridge.js";
import { getAiStatus } from "../lib/ai-credits.js";
import { requireAuth } from "../middlewares/auth.js"; 
export const instagramRouter = Router();
import jwt from "jsonwebtoken";

const IG_APP_ID = process.env.META_APP_ID || "";
const IG_APP_SECRET = process.env.META_APP_SECRET || "";
const IG_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "flychat-wa-2026";
const API_BASE = process.env.API_BASE_URL || "https://zealous-nature-production-771f.up.railway.app";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://flychatcodstore-production-a2e8.up.railway.app";
const CALLBACK_URL = `${API_BASE}/api/instagram/oauth/callback`;

instagramRouter.get("/oauth/start", async (req, res) => {
  // Support token from query param (browser redirect can't send Authorization header)
  const queryToken = req.query.token as string;
  let storeId: string | undefined;
  if (queryToken) {
    try {
      const secret = process.env.JWT_SECRET || "";
      const decoded = jwt.verify(queryToken, secret) as any;
      storeId = decoded.storeId;
      // If no storeId in token, look up from userId
      if (!storeId && decoded.userId) {
        const { rows } = await pool.query(
          `SELECT s.id FROM stores s JOIN organizations o ON s.organization_id = o.id JOIN team_members tm ON tm.store_id = s.id WHERE tm.user_id = $1 LIMIT 1`,

          [decoded.userId]
        );
        storeId = rows[0]?.id;
      }
    } catch (err) {
      console.error("[Instagram OAuth] Token verification failed:", err);
      res.status(401).json({ error: "invalid_token", detail: String(err) }); return;
    }
  } else {
    storeId = (req as any).user?.storeId;
  }
  if (!storeId) { res.status(400).json({ error: "No store found" }); return; }
  const state = Buffer.from(JSON.stringify({ storeId })).toString("base64url");
  const params = new URLSearchParams({
    client_id: IG_APP_ID,
    redirect_uri: CALLBACK_URL,
    scope: "instagram_basic,instagram_manage_messages,pages_show_list,pages_messaging",
    response_type: "code",
    state,
  });
  res.redirect(`https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`);
});

instagramRouter.get("/oauth/callback", async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) { res.redirect(`${FRONTEND_URL}/settings/channels?error=instagram_auth_failed`); return; }
  if (!code || !state) { res.redirect(`${FRONTEND_URL}/settings/channels?error=instagram_missing_params`); return; }
  try {
    const { storeId } = JSON.parse(Buffer.from(state, "base64url").toString());
    const tokenRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?` + new URLSearchParams({ client_id: IG_APP_ID, client_secret: IG_APP_SECRET, redirect_uri: CALLBACK_URL, code }));
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    const longRes = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?` + new URLSearchParams({ grant_type: "fb_exchange_token", client_id: IG_APP_ID, client_secret: IG_APP_SECRET, fb_exchange_token: tokenData.access_token }));
    const longData = await longRes.json() as any;
    const accessToken = longData.access_token || tokenData.access_token;
    const pagesRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
    const pagesData = await pagesRes.json() as any;
    const page = pagesData.data?.[0];
    if (!page) throw new Error("No Facebook Page found");
    const igRes = await fetch(`https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
    const igData = await igRes.json() as any;
    const igAccountId = igData.instagram_business_account?.id;
    if (!igAccountId) throw new Error("No Instagram Business Account linked to this Page");
    await fetch(`https://graph.facebook.com/v18.0/${page.id}/subscribed_apps?access_token=${page.access_token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscribed_fields: ["messages"] }) });
    const { rows: existing } = await pool.query(`SELECT id FROM channel_connections WHERE store_id = $1 AND channel = 'instagram' LIMIT 1`, [storeId]);
    if (existing.length > 0) {
      await pool.query(`UPDATE channel_connections SET status = 'connected', access_token = $1, external_account_id = $2, metadata = $3, updated_at = NOW() WHERE store_id = $4 AND channel = 'instagram'`, [page.access_token, igAccountId, JSON.stringify({ pageId: page.id }), storeId]);
    } else {
      await pool.query(`INSERT INTO channel_connections (id, store_id, channel, status, access_token, external_account_id, metadata, created_at, updated_at) VALUES ($1, $2, 'instagram', 'connected', $3, $4, $5, NOW(), NOW())`, [generateId("ch"), storeId, page.access_token, igAccountId, JSON.stringify({ pageId: page.id })]);
    }
    console.log(`[Instagram OAuth] Connected IG ${igAccountId} for store ${storeId}`);
    res.redirect(`${FRONTEND_URL}/settings/channels?success=instagram_connected`);
  } catch (err) {
    console.error("[Instagram OAuth] Callback error:", err);
    res.redirect(`${FRONTEND_URL}/settings/channels?error=instagram_setup_failed`);
  }
});

instagramRouter.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === IG_VERIFY_TOKEN) { console.log("[Instagram] Webhook verified"); res.status(200).send(challenge); }
  else { res.status(403).send("Forbidden"); }
});

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
        await processIncomingInstagramMessage({ igAccountId: event.recipient.id, senderId: event.sender.id, messageId: event.message.mid, text, timestamp: new Date(event.timestamp) }).catch(err => console.error("[Instagram] Processing error:", err));
      }
    }
  } catch (err) { console.error("[Instagram] Webhook error:", err); }
});

instagramRouter.post("/disconnect", requireAuth, async (req, res) => {
  const storeId = req.user?.storeId;
  if (!storeId) { res.status(400).json({ error: "No store" }); return; }
  await pool.query(`UPDATE channel_connections SET status = 'disconnected', access_token = NULL, external_account_id = NULL, updated_at = NOW() WHERE store_id = $1 AND channel = 'instagram'`, [storeId]);
  res.json({ success: true });
});

async function sendInstagramMessage(accessToken: string, recipientId: string, text: string) {
  const res = await fetch(`https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }) });
  const data = await res.json() as any;
  if (!res.ok) { console.error("[Instagram] Send failed:", JSON.stringify(data)); throw new Error(`Instagram send failed`); }
  return data;
}

async function processIncomingInstagramMessage(incoming: { igAccountId: string; senderId: string; messageId: string; text: string; timestamp: Date; }) {
  console.log(`[Instagram] Message from ${incoming.senderId}`);
  const { rows: channelRows } = await pool.query(`SELECT *, access_token as "accessToken", store_id as "storeId" FROM channel_connections WHERE channel = 'instagram' AND external_account_id = $1 AND status = 'connected' LIMIT 1`, [incoming.igAccountId]);
  const channel = channelRows[0];
  if (!channel) { console.warn(`[Instagram] No channel for IG account: ${incoming.igAccountId}`); return; }
  const { rows: storeRows } = await pool.query(`SELECT *, ai_enabled as "aiEnabled", ai_system_prompt as "aiSystemPrompt" FROM stores WHERE id = $1 LIMIT 1`, [channel.storeId]);
  const store = storeRows[0];
  if (!store) return;
  let customer = await db.select().from(customersTable).where(and(eq(customersTable.storeId, store.id), eq(customersTable.phone, incoming.senderId))).limit(1).then(r => r[0] ?? null);
  if (!customer) {
    const customerId = generateId("cust");
    await db.insert(customersTable).values({ id: customerId, storeId: store.id, phone: incoming.senderId, name: "Instagram User", createdAt: new Date(), updatedAt: new Date() });
    customer = await db.select().from(customersTable).where(eq(customersTable.id, customerId)).limit(1).then(r => r[0]);
  }
  const { rows: convRows } = await pool.query(`SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE store_id = $1 AND channel = 'instagram' AND customer_id = $2 AND status = 'open' ORDER BY created_at ASC LIMIT 1`, [store.id, customer!.id]);
  let conversation = convRows[0] ?? null;
  if (!conversation) {
    const convId = generateId("conv");
    await db.insert(conversationsTable).values({ id: convId, storeId: store.id, customerId: customer!.id, customerName: "Instagram User", channel: "instagram", status: "open", aiMode: store.aiEnabled ? "ai_autopilot" : "human", createdAt: new Date(), updatedAt: new Date() });
    const { rows: newRows } = await pool.query(`SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE id = $1 LIMIT 1`, [convId]);
    conversation = newRows[0];
  }
  if (!conversation) return;
  const existing = await db.select().from(messagesTable).where(eq(messagesTable.externalId, incoming.messageId)).limit(1).then(r => r[0] ?? null);
  if (existing) return;
  const msgId = generateId("msg");
  await db.insert(messagesTable).values({ id: msgId, conversationId: conversation.id, content: incoming.text, sender: "customer", externalId: incoming.messageId, createdAt: incoming.timestamp });
  await db.update(conversationsTable).set({ lastMessage: incoming.text, unreadCount: (conversation.unreadCount ?? 0) + 1, updatedAt: new Date() }).where(eq(conversationsTable.id, conversation.id));
  console.log(`[Instagram] Message saved: conv=${conversation.id}`);
  if (conversation.aiMode === "ai_autopilot" && store.aiEnabled) {
    const rawProducts = await db.select().from(productsTable).where(eq(productsTable.storeId, store.id));
    const products = rawProducts.map(p => ({ ...p, price: parseFloat(String(p.price)) || 0, stock: p.stock ?? 0 }));
    const recentOrders = await db.select().from(ordersTable).where(eq(ordersTable.storeId, store.id)).orderBy(desc(ordersTable.createdAt)).limit(20);
    await callAiBridge({ messageId: msgId, conversationId: conversation.id, storeId: store.id, storeName: store.name, aiSystemPrompt: store.aiSystemPrompt ?? undefined, products, recentOrders,
      emitNewMessage: async (_c, _s, _r, replyText) => { await sendInstagramMessage(channel.accessToken, incoming.senderId, replyText); console.log(`[Instagram] AI reply sent to ${incoming.senderId}`); },
      consumeCredits: async () => {},
      checkCredits: async () => { const status = await getAiStatus(store.id); return status.eligible; },
    });
  }
}
