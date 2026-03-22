import { Router } from "express";
import { db, channelConnectionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ channels: [] }); return; }
    const channels = await db.select().from(channelConnectionsTable).where(eq(channelConnectionsTable.storeId, storeId));
    res.json({ channels: channels.map(c => ({ ...c, metadata: c.metadata, accessToken: undefined, webhookSecret: undefined })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch channels" });
  }
});

router.post("/:id/connect", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const [channel] = await db.select().from(channelConnectionsTable)
      .where(and(eq(channelConnectionsTable.id, String(req.params.id)), eq(channelConnectionsTable.storeId, storeId))).limit(1);

    if (!channel) { res.status(404).json({ error: "not_found", message: "Channel not found" }); return; }

    // Scaffold: In a real implementation, this would initiate OAuth flows for WhatsApp/Instagram/Messenger
    const [updated] = await db.update(channelConnectionsTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(channelConnectionsTable.id, String(req.params.id)))
      .returning();

    res.json({ ...updated, metadata: updated.metadata });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to connect channel" });
  }
});

export default router;
