import { Router } from "express";
import { db, pool, storesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { findWilayaKey } from "../lib/ai-agent-bridge.js";

const router = Router();

router.get("/store", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.storeId) {
      res.status(404).json({ error: "not_found", message: "No store found" });
      return;
    }

    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, user.storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    res.json({
      id: store.id,
      name: store.name,
      description: store.description,
      phone: store.phone,
      logoUrl: store.logoUrl,
      websiteUrl: store.websiteUrl,
      defaultLanguage: store.defaultLanguage,
      widgetLanguage: store.widgetLanguage,
      shippingWilayas: store.shippingWilayas || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch store settings" });
  }
});

router.patch("/store", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { name, description, phone, logoUrl, websiteUrl, defaultLanguage, widgetLanguage, shippingWilayas } = req.body;
    const updates: Partial<typeof storesTable.$inferSelect> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (phone !== undefined) updates.phone = phone;
    if (logoUrl !== undefined) updates.logoUrl = logoUrl;
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;
    if (defaultLanguage) updates.defaultLanguage = defaultLanguage;
    if (widgetLanguage) updates.widgetLanguage = widgetLanguage;
    if (shippingWilayas) updates.shippingWilayas = shippingWilayas;

    const [updated] = await db.update(storesTable).set(updates)
      .where(eq(storesTable.id, user.storeId))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    // Update user language preference if changed
    if (defaultLanguage) {
      await db.update(usersTable).set({ language: defaultLanguage }).where(eq(usersTable.id, user.id));
    }

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      phone: updated.phone,
      logoUrl: updated.logoUrl,
      websiteUrl: updated.websiteUrl,
      defaultLanguage: updated.defaultLanguage,
      widgetLanguage: updated.widgetLanguage,
      shippingWilayas: updated.shippingWilayas || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update store settings" });
  }
});

router.get("/ai", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "owner" && user.role !== "admin") {
      res.status(403).json({ error: "forbidden", message: "Only owners and admins can view AI settings" });
      return;
    }
    if (!user.storeId) {
      res.status(404).json({ error: "not_found", message: "No store found" });
      return;
    }

    const [store] = await db.select().from(storesTable).where(eq(storesTable.id, user.storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    res.json({
      aiEnabled: store.aiEnabled,
      aiSystemPrompt: store.aiSystemPrompt || "",
      aiFallbackToHuman: store.aiFallbackToHuman,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch AI settings" });
  }
});

router.patch("/ai", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (user.role !== "owner" && user.role !== "admin") {
      res.status(403).json({ error: "forbidden", message: "Only owners and admins can update AI settings" });
      return;
    }
    if (!user.storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { aiEnabled, aiSystemPrompt, aiFallbackToHuman } = req.body;
    const updates: Partial<typeof storesTable.$inferSelect> = { updatedAt: new Date() };
    if (typeof aiEnabled === "boolean") updates.aiEnabled = aiEnabled;
    if (typeof aiSystemPrompt === "string") updates.aiSystemPrompt = aiSystemPrompt;
    if (typeof aiFallbackToHuman === "boolean") updates.aiFallbackToHuman = aiFallbackToHuman;

    const [updated] = await db.update(storesTable).set(updates)
      .where(eq(storesTable.id, user.storeId))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Store not found" }); return; }

    res.json({
      aiEnabled: updated.aiEnabled,
      aiSystemPrompt: updated.aiSystemPrompt || "",
      aiFallbackToHuman: updated.aiFallbackToHuman,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update AI settings" });
  }
});

// GET /api/settings/shipping-options
router.get("/shipping-options", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { rows } = await pool.query(
      `SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    res.json(rows[0]?.shipping_options || {
      homeDeliveryEnabled: true, homeDeliveryPrice: 0,
      pickupEnabled: false, pickupPrice: 0,
    });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/settings/shipping-price?wilaya=X&type=home_delivery|stopdesk
// No dedicated lookup endpoint existed before — this reuses the same fuzzy
// wilaya matching (findWilayaKey) the AI order-filling flow already relies
// on, against the real stores.shipping_options.wilayaPrices shape, instead
// of re-implementing accent/substring matching a second time.
router.get("/shipping-price", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { wilaya, type } = req.query as Record<string, string>;
    if (!wilaya) { res.status(400).json({ error: "validation_error", message: "wilaya is required" }); return; }

    const { rows } = await pool.query(`SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`, [storeId]);
    const wilayaPrices = rows[0]?.shipping_options?.wilayaPrices || {};
    const key = findWilayaKey(wilayaPrices, wilaya);
    const priceEntry = key ? wilayaPrices[key] : undefined;

    if (!priceEntry) { res.json({ price: 0, found: false }); return; }

    if (type === "stopdesk") {
      const enabled = priceEntry.pickupEnabled !== false;
      res.json({ price: enabled ? Number(priceEntry.pickup || 0) : 0, found: true, enabled });
    } else {
      const enabled = priceEntry.homeEnabled !== false;
      res.json({ price: enabled ? Number(priceEntry.home || 0) : 0, found: true, enabled });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to look up shipping price" });
  }
});

// PATCH /api/settings/shipping-options
router.patch("/shipping-options", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await pool.query(
      `UPDATE stores SET shipping_options = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(req.body), storeId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/settings/channels-ai
router.get("/channels-ai", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { rows } = await pool.query(
      `SELECT metadata FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    const meta = rows[0]?.metadata || {};
    res.json({
      whatsapp: meta.aiMode_whatsapp || "human",
      instagram: meta.aiMode_instagram || "human",
      messenger: meta.aiMode_messenger || "human",
      widget: meta.aiMode_widget || "human",
    });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// PATCH /api/settings/channels-ai
router.patch("/channels-ai", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { whatsapp, instagram, messenger, widget } = req.body;

    // Store per-channel AI modes in store metadata JSONB
    await pool.query(
      `UPDATE stores SET 
        metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
        updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({
        aiMode_whatsapp: whatsapp || "human",
        aiMode_instagram: instagram || "human",
        aiMode_messenger: messenger || "human",
        aiMode_widget: widget || "human",
      }), storeId]
    );

    // Also update channel_connections defaultAiMode for each channel
    const channels = { whatsapp, instagram, messenger, widget };
    for (const [channel, mode] of Object.entries(channels)) {
      if (mode) {
        await pool.query(
          `UPDATE channel_connections 
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
               updated_at = NOW()
           WHERE store_id = $2 AND channel = $3`,
          [JSON.stringify({ defaultAiMode: mode }), storeId, channel]
        );
      }
    }

    res.json({ success: true, whatsapp, instagram, messenger, widget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── AI Rules ─────────────────────────────────────────────────────────────────
router.get("/ai-rules", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT metadata FROM stores WHERE id = $1 LIMIT 1`,
      [req.user!.storeId]
    );
    const meta = rows[0]?.metadata || {};
    res.json({ rules: meta.aiRules || "" });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/ai-rules", requireAuth, async (req, res) => {
  try {
    const { rules } = req.body;
    await pool.query(
      `UPDATE stores SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({ aiRules: rules ?? "" }), req.user!.storeId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/ai-rules", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { rules } = req.body;
    await pool.query(
      `UPDATE stores SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({ aiRules: rules ?? "" }), storeId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[Settings] AI rules save failed:", err);
    res.status(500).json({ error: "Failed to save rules" });
  }
});

// ─── AI Language ──────────────────────────────────────────────────────────────
router.get("/ai-language", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT metadata FROM stores WHERE id = $1 LIMIT 1`,
      [req.user!.storeId]
    );
    const meta = rows[0]?.metadata || {};
    res.json({ language: meta.aiLanguage || "auto" });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/ai-language", requireAuth, async (req, res) => {
  try {
    const { language } = req.body;
    await pool.query(
      `UPDATE stores SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify({ aiLanguage: language || "auto" }), req.user!.storeId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Apply AI to ALL conversations (all channels, incl. old/unreplied) ────────
router.post("/apply-ai-to-all-conversations", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { rowCount } = await pool.query(
      `UPDATE conversations
       SET ai_mode = 'ai_autopilot', updated_at = NOW()
       WHERE store_id = $1
         AND (ai_mode IS NULL OR ai_mode != 'ai_autopilot')`,
      [storeId]
    );
    res.json({ success: true, updated: rowCount, message: `AI enabled on ${rowCount} conversations` });
  } catch (err) {
    console.error("[Settings] apply-ai-to-all-conversations failed:", err);
    res.status(500).json({ error: "Failed to update conversations" });
  }
});

// ─── Bulk Apply AI Autopilot ──────────────────────────────────────────────────
router.post("/apply-ai-to-all", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { channel } = req.body;

    const channelFilter = channel && channel !== "all"
      ? "AND channel = $2"
      : "";
    const params: any[] = channel && channel !== "all"
      ? [storeId, channel]
      : [storeId];

    const { rows: updateRows } = await pool.query(
      `UPDATE conversations
       SET ai_mode = 'ai_autopilot', updated_at = NOW()
       WHERE store_id = $1
         AND status = 'open'
         AND ai_mode != 'ai_autopilot'
         ${channelFilter}
       RETURNING id`,
      params
    );

    const updatedCount = updateRows.length;
    console.log(`[Settings] Applied AI to ${updatedCount} ${channel} conversations for store ${storeId}`);
    res.json({ success: true, updatedCount, channel });
  } catch (err) {
    console.error("[Settings] Apply AI to all failed:", err);
    res.status(500).json({ error: "Failed to apply AI" });
  }
});

// ─── AI Data Quality ──────────────────────────────────────────────────────────
router.get("/ai-data-quality", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { rows: productRows } = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE description IS NOT NULL AND description != '') as with_desc,
              COUNT(*) FILTER (WHERE stock IS NOT NULL) as with_stock,
              COUNT(*) FILTER (WHERE is_active = true) as active
       FROM products WHERE store_id = $1`,
      [storeId]
    );
    const { rows: storeRows } = await pool.query(
      `SELECT ai_system_prompt, name FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    const { rows: shippingRows } = await pool.query(
      `SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );

    const p = productRows[0];
    const store = storeRows[0];
    const shippingOptions = shippingRows[0]?.shipping_options || {};

    res.json({
      products: {
        total: parseInt(p.total) || 0,
        withDescription: parseInt(p.with_desc) || 0,
        withStock: parseInt(p.with_stock) || 0,
        active: parseInt(p.active) || 0,
      },
      hasSystemPrompt: !!(store?.ai_system_prompt?.trim()),
      hasStoreName: !!(store?.name?.trim()),
      hasShipping: !!(shippingOptions.homeDeliveryEnabled || shippingOptions.pickupEnabled),
    });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
