import { Router } from "express";
import { db, productsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";

const router = Router();

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

    const products = await db.select().from(productsTable)
      .where(and(...conditions))
      .orderBy(sql`${productsTable.createdAt} desc`)
      .limit(limitNum).offset(offset);

    const [{ total }] = await db.select({ total: sql<number>`count(*)` }).from(productsTable).where(and(...conditions));

    res.json({
      products: products.map(p => ({ ...p, price: Number(p.price) })),
      total: Number(total), page: pageNum, limit: limitNum
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch products" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { name, description, price, stock, isActive = true, variants = [], imageUrl } = req.body;
    if (!name || price === undefined) {
      res.status(400).json({ error: "validation_error", message: "name and price are required" });
      return;
    }

    const [product] = await db.insert(productsTable).values({
      id: generateId("prod"),
      storeId,
      name,
      description,
      price: price.toString(),
      stock,
      isActive,
      variants: Array.isArray(variants) ? variants : [],
      imageUrl,
    }).returning();

    res.status(201).json({ ...product, price: Number(product.price) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create product" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const [product] = await db.select().from(productsTable)
      .where(and(eq(productsTable.id, req.params.id), eq(productsTable.storeId, storeId!))).limit(1);

    if (!product) { res.status(404).json({ error: "not_found", message: "Product not found" }); return; }
    res.json({ ...product, price: Number(product.price) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch product" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { name, description, price, stock, isActive, variants, imageUrl } = req.body;
    const updates: Partial<typeof productsTable.$inferSelect> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (price !== undefined) updates.price = price.toString();
    if (stock !== undefined) updates.stock = stock;
    if (isActive !== undefined) updates.isActive = isActive;
    if (variants) updates.variants = variants;
    if (imageUrl !== undefined) updates.imageUrl = imageUrl;

    const [updated] = await db.update(productsTable).set(updates)
      .where(and(eq(productsTable.id, req.params.id), eq(productsTable.storeId, storeId!)))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Product not found" }); return; }
    res.json({ ...updated, price: Number(updated.price) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update product" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await db.delete(productsTable).where(and(eq(productsTable.id, req.params.id), eq(productsTable.storeId, storeId!)));
    res.json({ success: true, message: "Product deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to delete product" });
  }
});

export default router;
