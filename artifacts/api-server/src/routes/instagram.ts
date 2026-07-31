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
import { getProductFromAdRef, buildAdProductPrompt } from "../lib/ad-product-lookup.js";
import { analyzeImage } from "../lib/analyze-image.js";
import { fetchInstagramProfile } from "../lib/fetch-meta-profile.js";
import { ensureProfilePicColumns } from "../lib/schema-bootstrap.js";

const GENERIC_INSTAGRAM_NAME = "Instagram User";
function isGenericName(name: string | null | undefined): boolean {
  return !name || !name.trim() || name === GENERIC_INSTAGRAM_NAME;
}

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

  res.redirect(`https://www.instagram.com/oauth/authorize?${params.toString()}`);
});

// ─── OAuth Callback ───────────────────────────────────────────────────────────
instagramRouter.get("/oauth/callback", async (req, res) => {
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

    if (!tokenData.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);

    const shortToken = tokenData.access_token;

    let igUsername = "";
    try {
      const userRes = await fetch(
        `https://graph.instagram.com/me?fields=username&access_token=${shortToken}`
      );
      const userData = await userRes.json() as any;
      igUsername = userData.username || "";
    } catch {}

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

    const appScopedId = String(tokenData.user_id || "pending");

    console.log(`[Instagram OAuth] Connected app-scoped ID ${appScopedId} for store ${storeId}`);

    const { rows: existing } = await pool.query(
      `SELECT id FROM channel_connections WHERE store_id = $1 AND channel = 'instagram' LIMIT 1`,
      [storeId]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE channel_connections SET status = 'connected', access_token = $1, external_account_id = 'pending', metadata = $2, updated_at = NOW() WHERE store_id = $3 AND channel = 'instagram'`,
        [accessToken, JSON.stringify({ appScopedId, username: igUsername, realIdPending: true }), storeId]
      );
    } else {
      await pool.query(
        `INSERT INTO channel_connections (id, store_id, channel, status, access_token, external_account_id, metadata, created_at, updated_at) VALUES ($1, $2, 'instagram', 'connected', $3, 'pending', $4, NOW(), NOW())`,
        [generateId("ch"), storeId, accessToken, JSON.stringify({ appScopedId, username: igUsername, realIdPending: true })]
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
        if (!event.message) continue;

        // Echo: message sent from our IG account — save as agent message
        if (event.message.is_echo) {
          const recipientId = event.recipient?.id;
          const igAccountId = event.sender?.id;
          if (!recipientId || !igAccountId) continue;
          const echoAttachment = event.message.attachments?.[0];
          const echoIsImage = !event.message.text && echoAttachment?.type === "image";
          await saveInstagramEcho({
            igAccountId,
            recipientId,
            messageId: event.message.mid,
            text: event.message.text || (echoIsImage ? "📷 Image" : "[attachment]"),
            imageUrl: echoIsImage ? (echoAttachment?.payload?.url ?? undefined) : undefined,
            timestamp: new Date(event.timestamp),
          }).catch(err => console.error("[Instagram] Echo save failed:", err));
          continue;
        }

        const text = event.message.text;
        const attachment = event.message.attachments?.[0];
        const isAudio = !text && attachment?.type === "audio";
        const isImage = !text && attachment?.type === "image";
        if (!text && !isAudio && !isImage) continue;
        const referral = event.referral || event.message?.referral || null;
        const adRef = referral?.ref || null;
        await processIncomingInstagramMessage({
          igAccountId: event.recipient.id,
          senderId: event.sender.id,
          messageId: event.message.mid,
          text: text || (isAudio ? "[🎤 Voice message]" : "📷 Image"),
          timestamp: new Date(event.timestamp),
          adRef,
          isAudio,
          imageUrl: isImage ? (attachment?.payload?.url ?? undefined) : undefined,
          audioUrl: isAudio ? (attachment?.payload?.url ?? undefined) : undefined,
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

// ─── Save Instagram Echo (outgoing message from our IG account) ───────────────
async function saveInstagramEcho(incoming: {
  igAccountId: string;
  recipientId: string;
  messageId: string;
  text: string;
  imageUrl?: string;
  timestamp: Date;
}) {
  const { rows: channelRows } = await pool.query(
    `SELECT store_id as "storeId" FROM channel_connections WHERE channel = 'instagram' AND status = 'connected' AND (external_account_id = $1 OR external_account_id = 'pending') LIMIT 1`,
    [incoming.igAccountId]
  );
  const channel = channelRows[0];
  if (!channel) return;

  const customer = await db.select().from(customersTable)
    .where(and(eq(customersTable.storeId, channel.storeId), eq(customersTable.phone, incoming.recipientId)))
    .limit(1).then(r => r[0] ?? null);
  if (!customer) return;

  const conv = await db.select().from(conversationsTable)
    .where(and(
      eq(conversationsTable.storeId, channel.storeId),
      eq(conversationsTable.customerId, customer.id),
      eq(conversationsTable.channel, "instagram"),
    )).limit(1).then(r => r[0] ?? null);
  if (!conv) return;

  if (incoming.messageId) {
    const { rows } = await pool.query(`SELECT id FROM messages WHERE external_id = $1 LIMIT 1`, [incoming.messageId]);
    if (rows.length > 0) return;
  }

  await db.insert(messagesTable).values({
    id: generateId("msg"),
    conversationId: conv.id,
    content: incoming.text,
    sender: "agent",
    externalId: incoming.messageId || null,
    metadata: incoming.imageUrl
      ? { type: "image", imageUrl: incoming.imageUrl, source: "meta_echo", channel: "instagram" }
      : { source: "meta_echo", channel: "instagram" },
    createdAt: incoming.timestamp,
  });
  console.log(`[Instagram] Echo saved for conv ${conv.id}`);
}

// ─── Process Incoming Message ─────────────────────────────────────────────────
async function processIncomingInstagramMessage(incoming: {
  igAccountId: string;
  senderId: string;
  messageId: string;
  text: string;
  timestamp: Date;
  adRef?: string | null;
  isAudio?: boolean;
  imageUrl?: string;
  audioUrl?: string;
}) {
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

  // Self-heal external_account_id
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

  const { rows: storeRows } = await pool.query(
    `SELECT *, ai_enabled as "aiEnabled", ai_system_prompt as "aiSystemPrompt" FROM stores WHERE id = $1 LIMIT 1`,
    [channel.storeId]
  );
  const store = storeRows[0];
  if (!store) return;

  await ensureProfilePicColumns();

  let customer = await db.select().from(customersTable)
    .where(and(eq(customersTable.storeId, store.id), eq(customersTable.phone, incoming.senderId)))
    .limit(1).then(r => r[0] ?? null);

  // Real name is never in the webhook payload — only known from Graph API.
  // Fetch it once when the customer is new, or self-heal a still-generic name.
  let resolvedName = customer?.name ?? null;
  let resolvedProfilePic = customer?.profilePic ?? null;
  if (!customer || isGenericName(customer.name)) {
    const profile = await fetchInstagramProfile(incoming.senderId, channel.accessToken);
    resolvedName = profile.name || profile.username || GENERIC_INSTAGRAM_NAME;
    resolvedProfilePic = profile.profilePic || resolvedProfilePic;
    // A dead token doesn't just break name lookups — it breaks outgoing sends
    // too (same token). Flag the connection as errored so it shows up as
    // broken in Channels instead of silently failing on every message.
    if (profile.tokenInvalid) {
      await pool.query(`UPDATE channel_connections SET status = 'error', updated_at = NOW() WHERE id = $1`, [channel.id])
        .catch(err => console.error("[Instagram] Failed to flag connection as errored:", err));
      console.error(`[Instagram] Page token invalid for store ${store.id} — connection flagged 'error', needs reconnect.`);
    }
  }

  if (!customer) {
    const customerId = generateId("cust");
    await db.insert(customersTable).values({
      id: customerId, storeId: store.id, phone: incoming.senderId,
      name: resolvedName || GENERIC_INSTAGRAM_NAME, profilePic: resolvedProfilePic,
      createdAt: new Date(), updatedAt: new Date(),
    });
    customer = await db.select().from(customersTable)
      .where(eq(customersTable.id, customerId)).limit(1).then(r => r[0]);
  } else if (resolvedName && resolvedName !== customer.name) {
    await pool.query(
      `UPDATE customers SET name = $1, profile_pic = COALESCE($2, profile_pic), updated_at = NOW()
       WHERE id = $3 AND (name IS NULL OR name = $4 OR name = '')`,
      [resolvedName, resolvedProfilePic, customer.id, GENERIC_INSTAGRAM_NAME]
    );
    customer = { ...customer, name: resolvedName, profilePic: resolvedProfilePic ?? customer.profilePic };
  }

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
      customerName: customer!.name || GENERIC_INSTAGRAM_NAME,
      customerProfilePic: customer!.profilePic ?? null,
      channel: "instagram", status: "open",
      aiMode,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const { rows: newRows } = await pool.query(
      `SELECT *, ai_mode as "aiMode", unread_count as "unreadCount", last_message as "lastMessage", store_id as "storeId", customer_id as "customerId" FROM conversations WHERE id = $1 LIMIT 1`,
      [convId]
    );
    conversation = newRows[0];
  } else if (isGenericName(conversation.customerName) && !isGenericName(customer!.name)) {
    await pool.query(
      `UPDATE conversations SET customer_name = $1, customer_profile_pic = COALESCE($2, customer_profile_pic)
       WHERE id = $3`,
      [customer!.name, customer!.profilePic ?? null, conversation.id]
    );
    conversation.customerName = customer!.name;
  }

  if (!conversation) return;

  const existing = await db.select().from(messagesTable)
    .where(eq(messagesTable.externalId, incoming.messageId)).limit(1).then(r => r[0] ?? null);
  if (existing) return;

  const msgId = generateId("msg");
  const msgMetadata: Record<string, unknown> = {};
  let msgContent = incoming.text;
  let imageUsedVision = false;
  if (incoming.imageUrl) {
    msgMetadata.type = "image";
    msgMetadata.imageUrl = incoming.imageUrl;
    const analysis = await analyzeImage(incoming.imageUrl, channel.accessToken ?? undefined, store.id);
    msgMetadata.description = analysis.description;
    msgContent = analysis.description;
    imageUsedVision = analysis.usedVision;
    console.log(`[Instagram] Image analyzed (vision=${imageUsedVision}): ${msgContent.substring(0, 80)}`);
  } else if (incoming.audioUrl) {
    msgMetadata.type = "audio";
    msgMetadata.audioUrl = incoming.audioUrl;
  }
  await db.insert(messagesTable).values({
    id: msgId, conversationId: conversation.id, content: msgContent,
    sender: "customer", externalId: incoming.messageId, createdAt: incoming.timestamp,
    metadata: Object.keys(msgMetadata).length ? msgMetadata : undefined,
  });

  // The conversation list preview has no metadata to inspect — never show the
  // raw Vision analysis text/failure placeholder there, just a clean label.
  await db.update(conversationsTable).set({
    lastMessage: incoming.imageUrl ? "📷 Image" : incoming.audioUrl ? "🎤 Voice message" : msgContent,
    unreadCount: (conversation.unreadCount ?? 0) + 1,
    updatedAt: new Date(),
  }).where(eq(conversationsTable.id, conversation.id));

  console.log(`[Instagram] Message saved: conv=${conversation.id}${incoming.imageUrl ? " (image)" : ""}`);

  try {
    const { getIO } = await import("../socket.js");
    const io = getIO();
    io.to(`store:${store.id}`).emit("new_conversation_message", {
      conversationId: conversation.id,
      storeId: store.id,
    });
  } catch {}

  // Voice message — send friendly reply, escalate to human, skip AI
  if (incoming.isAudio) {
    await sendInstagramMessage(channel.accessToken, incoming.senderId,
      "🎤 واه سمعناك — ما نقدرش نقرا الرسايل الصوتية. كتب طلبك هنا ونردو عليك قريب 🙏"
    );
    const { escalateConversation } = await import("../lib/automation-engine.js");
    await escalateConversation(store.id, conversation.id, conversation.customerName ?? "Customer");
    console.log(`[Instagram] Voice message — escalated to human: conv=${conversation.id}`);
    return;
  }

  if (conversation.aiMode === "ai_autopilot" && store.aiEnabled) {
    const rawProducts = await db.select().from(productsTable)
  .where(and(eq(productsTable.storeId, store.id), eq(productsTable.isActive, true)));
    const products = rawProducts.map(p => ({
  ...p,
  price: parseFloat(String(p.price)) || 0,
  stock: p.stock ?? 0,
  imageUrl: p.imageUrl ?? undefined,
  description: p.description ?? undefined,
  }));
    const recentOrders = await db.select().from(ordersTable)
      .where(eq(ordersTable.storeId, store.id))
      .orderBy(desc(ordersTable.createdAt)).limit(20);

    // ─── Ad referral: focus AI on the specific product from the ad ───────────
    const adProduct = await getProductFromAdRef(store.id, incoming.adRef);
    const aiSystemPromptWithAd = buildAdProductPrompt(store.aiSystemPrompt ?? undefined, adProduct);

    await callAiBridge({
      messageId: msgId, conversationId: conversation.id,
      storeId: store.id, storeName: store.name,
      aiSystemPrompt: aiSystemPromptWithAd,
      products, recentOrders,
      emitNewMessage: async (_c, _s, _r, replyText) => {
        await sendInstagramMessage(channel.accessToken, incoming.senderId, replyText);
        console.log(`[Instagram] AI reply sent to ${incoming.senderId}`);
      },
      consumeCredits: async () => {
        const credits = imageUsedVision ? 2 : 1;
        try {
          await pool.query(
            `UPDATE subscriptions
             SET ai_credits_used_current_period = ai_credits_used_current_period + $2,
                 updated_at = NOW()
             WHERE organization_id = (SELECT organization_id FROM stores WHERE id = $1)`,
            [store.id, credits]
          );
        } catch (err) {
          console.error("[Credits] Instagram: failed to consume credits:", err);
        }
      },
      checkCredits: async () => {
        const status = await getAiStatus(store.id);
        return status.eligible;
      },
    });
  }
}