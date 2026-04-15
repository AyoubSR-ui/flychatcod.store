import { Router } from "express";
import { db, pool } from "@workspace/db";
import { conversationsTable, messagesTable, storesTable, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// ─── Backfill Meta Conversations ─────────────────────────────────────────────
// Messenger: GET /me/conversations?platform=messenger  (page access token)
// Instagram: GET /me/conversations?platform=instagram  (IG access token)
// WhatsApp:  not supported via Graph API — messages not retrievable historically
router.get("/meta-conversations", requireAuth, async (req, res) => {
  let currentChannel = "none";
  try {
    const storeId = req.user!.storeId;

    const { rows: channels } = await pool.query(
      `SELECT * FROM channel_connections WHERE store_id = $1 AND status = 'connected' AND channel IN ('messenger', 'instagram')`,
      [storeId]
    );

    console.log(`[Sync] Found ${channels.length} connected channel(s) for store ${storeId}`);

    let totalConvsSynced = 0;
    let totalMsgsSynced = 0;
    let skipped = 0;
    const channelErrors: string[] = [];

    for (const channel of channels) {
      currentChannel = channel.channel;
      console.log(`[Sync] Channel: ${channel.channel}, externalId: ${channel.external_account_id}, hasToken: ${!!channel.access_token}`);

      if (!channel.access_token) {
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
            channelErrors.push(`${channel.channel}: ${responseText.substring(0, 200)}`);
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
        channelErrors.push(`${channel.channel}: ${err?.message}`);
      }
    }

    res.json({
      success: true,
      conversationsSynced: totalConvsSynced,
      messagesSynced: totalMsgsSynced,
      skipped,
      channelErrors: channelErrors.length ? channelErrors : undefined,
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
// Returns conversations that resulted in confirmed orders as OpenAI fine-tuning format.
router.get("/export-training-data", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;

    const [store] = await db.select().from(storesTable)
      .where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "Store not found" }); return; }

    // Conversations that have at least one confirmed/delivered/shipped order
    const { rows: convs } = await pool.query(`
      SELECT DISTINCT c.id, c.customer_name, c.channel
      FROM conversations c
      JOIN orders o ON o.conversation_id = c.id
      WHERE c.store_id = $1
        AND o.status IN ('confirmed', 'delivered', 'shipped')
    `, [storeId]);

    const jsonlLines: string[] = [];

    for (const conv of convs) {
      const { rows: messages } = await pool.query(`
        SELECT content, sender, created_at
        FROM messages
        WHERE conversation_id = $1
          AND content NOT IN ('[🎤 Voice message]', '[attachment]')
          AND LENGTH(content) > 2
        ORDER BY created_at ASC
        LIMIT 30
      `, [conv.id]);

      if (messages.length < 4) continue;

      const trainingMessages: { role: string; content: string }[] = [
        {
          role: "system",
          content: `You are a professional COD sales agent for ${store.name}, an e-commerce store in Algeria. You help customers place orders, answer questions, and handle cancellations. Payment is always COD (cash on delivery).`,
        },
      ];

      for (const msg of messages) {
        if (msg.sender === "customer") {
          trainingMessages.push({ role: "user", content: msg.content });
        } else if (msg.sender === "agent" || msg.sender === "bot") {
          trainingMessages.push({ role: "assistant", content: msg.content });
        }
      }

      // Fine-tuning requires the conversation to end with an assistant turn
      if (trainingMessages[trainingMessages.length - 1].role !== "assistant") continue;

      jsonlLines.push(JSON.stringify({ messages: trainingMessages }));
    }

    res.setHeader("Content-Type", "application/jsonl");
    res.setHeader("Content-Disposition", `attachment; filename="training_data_${storeId}.jsonl"`);
    res.send(jsonlLines.join("\n"));
  } catch (err) {
    console.error("[Export] Failed:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
