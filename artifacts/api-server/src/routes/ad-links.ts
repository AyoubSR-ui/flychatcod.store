import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

// ─── GET /api/ad-links — list all ad links for store ─────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ links: [] }); return; }

    const { rows } = await pool.query(
      `SELECT al.*, p.name as product_name, p.image_url as product_image
       FROM ad_product_links al
       LEFT JOIN products p ON p.id = al.product_id
       WHERE al.store_id = $1
       ORDER BY al.created_at DESC`,
      [storeId]
    );
    res.json({ links: rows });
  } catch (err) {
    console.error("[AdLinks] List error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /api/ad-links — create a new ad link ────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { adRef, productId, adName } = req.body;
    if (!adRef || !productId) {
      res.status(400).json({ error: "adRef and productId are required" });
      return;
    }

    const id = generateId("adl");
    await pool.query(
      `INSERT INTO ad_product_links (id, store_id, ad_ref, product_id, ad_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (store_id, ad_ref) DO UPDATE SET product_id = $4, ad_name = $5`,
      [id, storeId, adRef.trim(), productId, adName?.trim() || null]
    );

    res.json({ success: true, id });
  } catch (err) {
    console.error("[AdLinks] Create error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── DELETE /api/ad-links/:id ─────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await pool.query(
      `DELETE FROM ad_product_links WHERE id = $1 AND store_id = $2`,
      [req.params.id, storeId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;