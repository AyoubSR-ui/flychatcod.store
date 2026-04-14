import { Router } from "express";
import { db, pool } from "@workspace/db";
import { conversationsTable, messagesTable, storesTable, customersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// ─── Backfill Messenger Conversations ────────────────────────────────────────
// Fetches past conversations from Meta Graph API and syncs messages into our DB.
// Only works for Messenger (Facebook page inbox). Requires message_echoes subscription.
router.get("/meta-conversations", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;

    // Get all connected Meta channels for this store
    const { rows: channels } = await pool.query(
      `SELECT * FROM channel_connections WHERE store_id = $1 AND status = 'connected' AND channel IN ('messenger', 'instagram')`,
      [storeId]
    );

    let totalConvsSynced = 0;
    let totalMsgsSynced = 0;
    let skipped = 0;

    for (const channel of channels) {
      if (!channel.access_token) continue;

      try {
        // /me/conversations is Messenger-only (page access token)
        if (channel.channel !== "messenger") continue;

        let url: string | null =
          `https://graph.facebook.com/v18.0/me/conversations?fields=messages{message,from,created_time,id}&limit=50&access_token=${channel.access_token}`;

        while (url) {
          const response = await fetch(url);
          if (!response.ok) {
            console.error(`[Sync] Graph API error: ${await response.text()}`);
            break;
          }
          const data = await response.json() as any;

          for (const metaConv of (data.data || [])) {
            totalConvsSynced++;
            const pageId = channel.external_account_id;

            for (const msg of (metaConv.messages?.data || [])) {
              try {
                // Dedup by external_id
                const { rows: dup } = await pool.query(
                  `SELECT id FROM messages WHERE external_id = $1 LIMIT 1`,
                  [msg.id]
                );
                if (dup.length > 0) { skipped++; continue; }

                const isOutgoing = msg.from?.id === pageId;
                const sender = isOutgoing ? "agent" : "customer";
                const content = msg.message || "[attachment]";

                // Determine the customer PSID
                const customerPsid = isOutgoing
                  ? metaConv.messages?.data?.find((m: any) => m.from?.id !== pageId)?.from?.id
                  : msg.from?.id;
                if (!customerPsid) { skipped++; continue; }

                // Find customer by phone (we store PSID in phone for social channels)
                const customer = await db.select().from(customersTable)
                  .where(and(eq(customersTable.storeId, storeId), eq(customersTable.phone, customerPsid)))
                  .limit(1).then(r => r[0] ?? null);
                if (!customer) { skipped++; continue; }

                // Find conversation
                const conv = await db.select().from(conversationsTable)
                  .where(and(
                    eq(conversationsTable.storeId, storeId),
                    eq(conversationsTable.customerId, customer.id),
                    eq(conversationsTable.channel, "messenger"),
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
              } catch {
                skipped++;
              }
            }
          }

          url = data.paging?.next ?? null;
        }
      } catch (err) {
        console.error(`[Sync] Channel ${channel.channel} failed:`, err);
      }
    }

    res.json({
      success: true,
      conversationsSynced: totalConvsSynced,
      messagesSynced: totalMsgsSynced,
      skipped,
    });
  } catch (err) {
    console.error("[Sync] Meta sync failed:", err);
    res.status(500).json({ error: "Sync failed" });
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
