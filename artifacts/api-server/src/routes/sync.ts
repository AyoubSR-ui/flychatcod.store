import { Router } from "express";
import { db, pool } from "@workspace/db";
import { conversationsTable, messagesTable, storesTable, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { requireAuth } from "../middlewares/auth.js";
import { fetchMessengerProfile, fetchInstagramProfile } from "../lib/fetch-meta-profile.js";
import { ensureProfilePicColumns } from "../lib/schema-bootstrap.js";

const router = Router();

router.get("/ping", (_req, res) => { res.json({ ok: true }); });

// ─── Backfill Customer Names (Messenger/Instagram) ───────────────────────────
// Existing conversations from before real-name fetching was wired up are
// stuck on "Messenger User" / "Instagram User". This re-resolves their real
// name via Graph API using the PSID/IGSID stored in customers.phone.
const GENERIC_NAMES = ["Messenger User", "Instagram User", ""];
router.get("/backfill-names", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    await ensureProfilePicColumns();

    const { rows: convs } = await pool.query(
      `SELECT c.id as conversation_id, c.channel, c.customer_name,
              cu.id as customer_id, cu.phone as external_id, cu.name as customer_current_name,
              ch.access_token as "accessToken"
       FROM conversations c
       JOIN customers cu ON cu.id = c.customer_id
       JOIN channel_connections ch ON ch.store_id = c.store_id AND ch.channel = c.channel AND ch.status = 'connected'
       WHERE c.store_id = $1
         AND c.channel IN ('messenger', 'instagram')
         AND cu.phone IS NOT NULL
         AND (c.customer_name = ANY($2) OR cu.name = ANY($2))
       LIMIT 200`,
      [storeId, GENERIC_NAMES]
    );

    let updated = 0;
    let failed = 0;

    for (const conv of convs) {
      try {
        const profile = conv.channel === "messenger"
          ? await fetchMessengerProfile(conv.external_id, conv.accessToken)
          : await fetchInstagramProfile(conv.external_id, conv.accessToken);

        const name = profile.name || profile.username;
        if (!name) { failed++; continue; }

        await pool.query(
          `UPDATE conversations SET customer_name = $1, customer_profile_pic = COALESCE($2, customer_profile_pic) WHERE id = $3`,
          [name, profile.profilePic, conv.conversation_id]
        );
        await pool.query(
          `UPDATE customers SET name = $1, profile_pic = COALESCE($2, profile_pic), updated_at = NOW()
           WHERE id = $3 AND (name IS NULL OR name = ANY($4))`,
          [name, profile.profilePic, conv.customer_id, GENERIC_NAMES]
        );

        updated++;
        // Small delay to avoid hitting Meta rate limits
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`[BackfillNames] Failed for conv ${conv.conversation_id}:`, err);
        failed++;
      }
    }

    res.json({
      success: true,
      updated,
      failed,
      total: convs.length,
      message: `Updated ${updated} customer name${updated === 1 ? "" : "s"}`,
    });
  } catch (err) {
    console.error("[BackfillNames] Error:", err);
    res.status(500).json({ error: "Backfill failed" });
  }
});

// ─── Instagram Outgoing Sync (callable from scheduler) ───────────────────────
// Polls Instagram Graph API for all conversation messages and saves any outgoing
// (agent-sent) messages that arrived since last sync. Runs on-demand and every 6h.
export async function syncInstagramOutgoing(): Promise<{ synced: number; skipped: number }> {
  let synced = 0;
  let skipped = 0;

  const { rows: channels } = await pool.query(
    `SELECT store_id, access_token, external_account_id
     FROM channel_connections
     WHERE channel = 'instagram' AND status = 'connected' AND access_token IS NOT NULL`
  );

  console.log(`[Sync] Instagram outgoing sync — ${channels.length} channel(s)`);

  for (const channel of channels) {
    const storeId: string = channel.store_id;
    const accessToken: string = channel.access_token;
    const igPageId: string = channel.external_account_id;
    if (!storeId || !accessToken) continue;

    try {
      let url: string | null =
        `https://graph.facebook.com/v18.0/me/conversations?platform=instagram` +
        `&fields=messages{message,from,created_time,id}&limit=100&access_token=${accessToken}`;

      while (url) {
        const response = await fetch(url);
        console.log(`[Sync] Instagram Graph API status: ${response.status} (store ${storeId})`);

        if (!response.ok) {
          const text = await response.text();
          console.error(`[Sync] Instagram API error: ${text.substring(0, 500)}`);
          break;
        }

        const data = await response.json() as any;
        const convList: any[] = data.data || [];
        console.log(`[Sync] ${convList.length} Instagram conversation(s) returned`);

        for (const metaConv of convList) {
          const msgs: any[] = metaConv.messages?.data || [];

          for (const msg of msgs) {
            try {
              // Dedup
              const { rows: dup } = await pool.query(
                `SELECT id FROM messages WHERE external_id = $1 LIMIT 1`,
                [msg.id]
              );
              if (dup.length > 0) { skipped++; continue; }

              const isOutgoing = msg.from?.id === igPageId;
              const sender: "agent" | "customer" = isOutgoing ? "agent" : "customer";
              const content: string = msg.message || "[attachment]";

              const customerIgsid = isOutgoing
                ? msgs.find((m: any) => m.from?.id !== igPageId)?.from?.id
                : msg.from?.id;
              if (!customerIgsid) { skipped++; continue; }

              // Find customer by phone (we store IGSID in phone for Instagram)
              const customer = await db.select().from(customersTable)
                .where(and(eq(customersTable.storeId, storeId), eq(customersTable.phone, customerIgsid)))
                .limit(1).then(r => r[0] ?? null);
              if (!customer) { skipped++; continue; }

              const conv = await db.select().from(conversationsTable)
                .where(and(
                  eq(conversationsTable.storeId, storeId),
                  eq(conversationsTable.customerId, customer.id),
                  eq(conversationsTable.channel, "instagram"),
                )).limit(1).then(r => r[0] ?? null);
              if (!conv) { skipped++; continue; }

              await db.insert(messagesTable).values({
                id: generateId("msg"),
                conversationId: conv.id,
                content,
                sender,
                externalId: msg.id,
                metadata: { source: "instagram_poll", channel: "instagram" },
                createdAt: new Date(msg.created_time),
              });

              synced++;
            } catch (msgErr: any) {
              console.error(`[Sync] Instagram message insert failed: ${msgErr?.message}`);
              skipped++;
            }
          }
        }

        url = data.paging?.next ?? null;
      }
    } catch (err: any) {
      console.error(`[Sync] Instagram channel (store ${storeId}) failed:`, err?.message);
    }
  }

  return { synced, skipped };
}

// ─── Backfill Meta Conversations ─────────────────────────────────────────────
// Messenger: GET /me/conversations?platform=messenger  (page access token)
// Instagram: GET /me/conversations?platform=instagram  (IG access token)
// WhatsApp:  not supported via Graph API — messages not retrievable historically
router.get("/meta-conversations", requireAuth, async (req, res) => {
  let currentChannel = "none";
  try {
    const storeId = req.user!.storeId!;

    const { rows: channels } = await pool.query(
      `SELECT * FROM channel_connections WHERE store_id = $1 AND status = 'connected' AND channel IN ('messenger', 'instagram')`,
      [storeId]
    );

    console.log(`[Sync] Found ${channels.length} connected channel(s) for store ${storeId}`);

    let totalConvsSynced = 0;
    let totalMsgsSynced = 0;
    let skipped = 0;
    const perChannelResults: Record<string, { synced: number; error: string | null }> = {};

    for (const channel of channels) {
      currentChannel = channel.channel;
      const chResult = { synced: 0, error: null as string | null };
      perChannelResults[channel.channel] = chResult;

      console.log(`[Sync] Channel: ${channel.channel}, externalId: ${channel.external_account_id}, hasToken: ${!!channel.access_token}`);

      if (!channel.access_token) {
        chResult.error = "no_access_token";
        console.warn(`[Sync] Skipping ${channel.channel} — no access token`);
        continue;
      }

      try {
        // Both Messenger and Instagram use /me/conversations with platform param
        const platform = channel.channel === "instagram" ? "instagram" : "messenger";
        let url: string | null =
          `https://graph.facebook.com/v18.0/me/conversations?platform=${platform}&fields=messages{message,from,created_time,id}&limit=50&access_token=${channel.access_token}`;

        console.log(`[Sync] Fetching ${platform} conversations...`);

        while (url) {
          const response = await fetch(url);
          console.log(`[Sync] Meta API response status: ${response.status} for ${platform}`);

          if (!response.ok) {
            const responseText = await response.text();
            console.error(`[Sync] Meta API error for ${platform}: ${responseText.substring(0, 500)}`);
            chResult.error = responseText.substring(0, 200);
            break;
          }

          const responseText = await response.text();
          console.log(`[Sync] Meta API response (first 500 chars): ${responseText.substring(0, 500)}`);
          const data = JSON.parse(responseText) as any;

          const convList = data.data || [];
          console.log(`[Sync] ${platform} returned ${convList.length} conversation(s)`);

          for (const metaConv of convList) {
            totalConvsSynced++;
            const pageId = channel.external_account_id;
            const msgs = metaConv.messages?.data || [];

            for (const msg of msgs) {
              try {
                const { rows: dup } = await pool.query(
                  `SELECT id FROM messages WHERE external_id = $1 LIMIT 1`,
                  [msg.id]
                );
                if (dup.length > 0) { skipped++; continue; }

                const isOutgoing = msg.from?.id === pageId;
                const sender = isOutgoing ? "agent" : "customer";
                const content = msg.message || "[attachment]";

                const customerPsid = isOutgoing
                  ? msgs.find((m: any) => m.from?.id !== pageId)?.from?.id
                  : msg.from?.id;
                if (!customerPsid) { skipped++; continue; }

                const customer = await db.select().from(customersTable)
                  .where(and(eq(customersTable.storeId, storeId), eq(customersTable.phone, customerPsid)))
                  .limit(1).then(r => r[0] ?? null);
                if (!customer) { skipped++; continue; }

                const conv = await db.select().from(conversationsTable)
                  .where(and(
                    eq(conversationsTable.storeId, storeId),
                    eq(conversationsTable.customerId, customer.id),
                    eq(conversationsTable.channel, channel.channel as "messenger" | "instagram"),
                  )).limit(1).then(r => r[0] ?? null);
                if (!conv) { skipped++; continue; }

                await db.insert(messagesTable).values({
                  id: generateId("msg"),
                  conversationId: conv.id,
                  content,
                  sender,
                  externalId: msg.id,
                  metadata: { source: "meta_backfill", channel: channel.channel },
                  createdAt: new Date(msg.created_time),
                });

                chResult.synced++;
                totalMsgsSynced++;
              } catch (msgErr: any) {
                console.error(`[Sync] Message insert failed: ${msgErr?.message}`);
                skipped++;
              }
            }
          }

          url = data.paging?.next ?? null;
        }
      } catch (err: any) {
        console.error(`[Sync] Channel ${channel.channel} failed:`, err);
        chResult.error = err?.message ?? "unknown error";
      }
    }

    res.json({
      success: true,
      conversationsSynced: totalConvsSynced,
      messagesSynced: totalMsgsSynced,
      skipped,
      results: perChannelResults,
    });
  } catch (err: any) {
    console.error("[Sync] Meta sync failed:", err);
    res.status(500).json({
      error: "Sync failed",
      detail: err?.message,
      channel: currentChannel,
    });
  }
});

// ─── Export Training Data (JSONL) ─────────────────────────────────────────────
// Returns high-quality conversations (confirmed orders OR qualified leads, 6+ msgs,
// customer asked about price/wilaya/size) as clean OpenAI fine-tuning JSONL.
router.get("/export-training-data", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId!;

    const [store] = await db.select().from(storesTable)
      .where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }

    // ── Qualify conversations: confirmed order OR qualified_lead, 6+ messages,
    //    with at least one customer message touching price/wilaya/size
    const { rows: convs } = await pool.query(`
      SELECT c.id, c.customer_name, c.channel
      FROM conversations c
      WHERE c.store_id = $1
        AND (
          c.lead_stage = 'qualified_lead'
          OR c.lead_stage = 'order_confirmed'
          OR EXISTS (
            SELECT 1 FROM orders o
            WHERE o.conversation_id = c.id
              AND o.status NOT IN ('cancelled')
          )
        )
        AND (
          SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
        ) >= 6
        AND EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender = 'customer'
            AND (
              m.content ILIKE '%سعر%' OR m.content ILIKE '%ثمن%' OR m.content ILIKE '%بشحال%'
              OR m.content ILIKE '%bchhal%' OR m.content ILIKE '%prix%' OR m.content ILIKE '%combien%'
              OR m.content ILIKE '%ولاية%' OR m.content ILIKE '%wilaya%' OR m.content ILIKE '%توصيل%'
              OR m.content ILIKE '%مقاس%' OR m.content ILIKE '%taille%' OR m.content ILIKE '%pointure%'
              OR m.content ILIKE '%size%' OR m.content ILIKE '%livraison%'
            )
        )
      ORDER BY c.created_at DESC
    `, [storeId]);

    // ── Patterns to drop (system noise, FB URLs, voice placeholders)
    const NOISE_PATTERNS = [
      /^Auto-label added/i,
      /^replied to (an|a|your) ad/i,
      /^facebook\.com\//i,
      /^https?:\/\/(www\.)?facebook\.com/i,
      /^\[🎤\s*Voice message\]/i,
      /^\[voice message\]/i,
      /^\[attachment\]$/i,
      /^🎤$/,
      /^Sticker$/i,
    ];

    function isNoise(content: string): boolean {
      const trimmed = content.trim();
      if (trimmed.length <= 2) return true;
      return NOISE_PATTERNS.some(p => p.test(trimmed));
    }

    const jsonlLines: string[] = [];

    for (const conv of convs) {
      const { rows: rawMessages } = await pool.query(`
        SELECT content, sender, created_at
        FROM messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC
      `, [conv.id]);

      // ── Clean: remove noise
      const cleaned = rawMessages.filter(
        (m: any) => !isNoise(m.content ?? "")
      );

      // ── Clean: remove duplicate consecutive messages from same sender
      const deduped: typeof cleaned = [];
      for (const msg of cleaned) {
        const prev = deduped[deduped.length - 1];
        if (
          prev &&
          prev.sender === msg.sender &&
          prev.content.trim().toLowerCase() === msg.content.trim().toLowerCase()
        ) continue;
        deduped.push(msg);
      }

      // Need at least 3 turns after cleaning
      if (deduped.length < 3) continue;

      // ── Build OpenAI fine-tuning format
      const trainingMessages: { role: string; content: string }[] = [
        {
          role: "system",
          content: `You are a professional COD sales agent for ${store.name}, an Algerian e-commerce store. Help customers place orders, answer product questions, and handle cancellations. Payment is always COD (cash on delivery). Price is always 3500 DA.`,
        },
      ];

      for (const msg of deduped) {
        if (msg.sender === "customer") {
          trainingMessages.push({ role: "user", content: msg.content.trim() });
        } else if (msg.sender === "agent" || msg.sender === "bot") {
          trainingMessages.push({ role: "assistant", content: msg.content.trim() });
        }
        // ignore "system" sender rows
      }

      // Fine-tuning requires ending with an assistant turn
      if (trainingMessages[trainingMessages.length - 1]?.role !== "assistant") continue;
      // Must have at least one user + one assistant turn beyond system
      if (trainingMessages.length < 3) continue;

      jsonlLines.push(JSON.stringify({ messages: trainingMessages }));
    }

    console.log(`[Export] ${jsonlLines.length} training examples from ${convs.length} qualified conversations`);

    res.setHeader("Content-Type", "application/jsonl");
    res.setHeader("Content-Disposition", `attachment; filename="training_data_${storeId}.jsonl"`);
    res.send(jsonlLines.join("\n"));
  } catch (err) {
    console.error("[Export] Failed:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
