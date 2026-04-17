import { Router } from "express";
import { db, pool, productsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

// Helper to parse image_urls from DB row
function parseImageUrls(row: any): string[] {
  if (!row) return [];
  try {
    if (Array.isArray(row.image_urls)) return row.image_urls;
    if (typeof row.image_urls === "string") return JSON.parse(row.image_urls);
  } catch {}
  return row.image_url ? [row.image_url] : [];
}

// ─── GET /api/products ────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ products: [], total: 0, page: 1, limit: 20 }); return; }

    const { search, active, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(productsTable.storeId, storeId)];
    if (search) conditions.push(ilike(productsTable.name, `%${search}%`));
    if (active === "true") conditions.push(eq(productsTable.isActive, true));
    if (active === "false") conditions.push(eq(productsTable.isActive, false));

    // Use raw query to get image_urls column
    let whereClause = `store_id = $1`;
    const params: any[] = [storeId];
    if (search) { params.push(`%${search}%`); whereClause += ` AND name ILIKE $${params.length}`; }
    if (active === "true") whereClause += ` AND is_active = true`;
    if (active === "false") whereClause += ` AND is_active = false`;

    const { rows } = await pool.query(
      `SELECT *, image_urls FROM products WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limitNum, offset]
    );
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) as total FROM products WHERE ${whereClause}`,
      params
    );

    res.json({
      products: rows.map(p => ({
        ...p,
        price: Number(p.price),
        isActive: p.is_active,
        imageUrl: p.image_url,
        imageUrls: parseImageUrls(p),
        aiImages: p.ai_images || [],
        storeId: p.store_id,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        shopifyProductId: p.shopify_product_id,
      })),
      total: Number(countRows[0]?.total || 0),
      page: pageNum,
      limit: limitNum,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch products" });
  }
});

// ─── POST /api/products ───────────────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { name, description, price, stock, isActive = true, variants = [], imageUrl, imageUrls = [], aiImages = [] } = req.body;
    if (!name || price === undefined) {
      res.status(400).json({ error: "validation_error", message: "name and price are required" });
      return;
    }

    const allImages: string[] = Array.isArray(imageUrls) && imageUrls.length > 0
      ? imageUrls
      : (imageUrl ? [imageUrl] : []);
    const primaryImage = allImages[0] || null;
    const id = generateId("prod");

    await pool.query(
      `INSERT INTO products (id, store_id, name, description, price, stock, is_active, variants, image_url, image_urls, ai_images, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
      [id, storeId, name, description || null, price.toString(), stock ?? null, isActive,
       JSON.stringify(Array.isArray(variants) ? variants : []), primaryImage, JSON.stringify(allImages),
       JSON.stringify(Array.isArray(aiImages) ? aiImages : [])]
    );

    const { rows } = await pool.query(`SELECT * FROM products WHERE id = $1`, [id]);
    const p = rows[0];
    res.status(201).json({
      ...p, price: Number(p.price), isActive: p.is_active,
      imageUrl: p.image_url, imageUrls: parseImageUrls(p),
      aiImages: p.ai_images || [],
      storeId: p.store_id, createdAt: p.created_at, updatedAt: p.updated_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create product" });
  }
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { rows } = await pool.query(
      `SELECT * FROM products WHERE id = $1 AND store_id = $2 LIMIT 1`,
      [req.params.id, storeId]
    );
    if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Product not found" }); return; }
    const p = rows[0];
    res.json({
      ...p, price: Number(p.price), isActive: p.is_active,
      imageUrl: p.image_url, imageUrls: parseImageUrls(p),
      aiImages: p.ai_images || [],
      storeId: p.store_id, createdAt: p.created_at, updatedAt: p.updated_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch product" });
  }
});

// ─── PATCH /api/products/:id ──────────────────────────────────────────────────
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { name, description, price, stock, isActive, variants, imageUrl, imageUrls, aiImages } = req.body;

    const setClauses: string[] = ["updated_at = NOW()"];
    const params: any[] = [];

    if (name !== undefined) { params.push(name); setClauses.push(`name = $${params.length}`); }
    if (description !== undefined) { params.push(description); setClauses.push(`description = $${params.length}`); }
    if (price !== undefined) { params.push(price.toString()); setClauses.push(`price = $${params.length}`); }
    if (stock !== undefined) { params.push(stock); setClauses.push(`stock = $${params.length}`); }
    if (isActive !== undefined) { params.push(isActive); setClauses.push(`is_active = $${params.length}`); }
    if (variants !== undefined) { params.push(JSON.stringify(variants)); setClauses.push(`variants = $${params.length}`); }

    // Handle AI suggested images
    if (aiImages !== undefined) {
      params.push(JSON.stringify(Array.isArray(aiImages) ? aiImages : []));
      setClauses.push(`ai_images = $${params.length}`);
    }

    // Handle images
    if (imageUrls !== undefined || imageUrl !== undefined) {
      const allImages: string[] = Array.isArray(imageUrls) && imageUrls.length > 0
        ? imageUrls
        : (imageUrl ? [imageUrl] : []);
      const primary = allImages[0] || null;
      params.push(primary); setClauses.push(`image_url = $${params.length}`);
      params.push(JSON.stringify(allImages)); setClauses.push(`image_urls = $${params.length}`);
    }

    params.push(req.params.id, storeId);
    const { rows } = await pool.query(
      `UPDATE products SET ${setClauses.join(", ")} WHERE id = $${params.length - 1} AND store_id = $${params.length} RETURNING *`,
      params
    );

    if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Product not found" }); return; }
    const p = rows[0];
    res.json({
      ...p, price: Number(p.price), isActive: p.is_active,
      imageUrl: p.image_url, imageUrls: parseImageUrls(p),
      aiImages: p.ai_images || [],
      storeId: p.store_id, createdAt: p.created_at, updatedAt: p.updated_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update product" });
  }
});

// ─── DELETE /api/products/:id ─────────────────────────────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await pool.query(
      `DELETE FROM products WHERE id = $1 AND store_id = $2`,
      [req.params.id, storeId]
    );
    res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to delete product" });
  }
});

export default router;