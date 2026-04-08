import { pool } from "@workspace/db";

// Look up product linked to an ad referral
export async function getProductFromAdRef(storeId: string, adRef: string | null | undefined): Promise<{ id: string; name: string; price: number; imageUrl?: string } | null> {
  if (!adRef) return null;

  try {
    // 1. Check explicit ad link mapping first
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.price, p.image_url as "imageUrl"
       FROM ad_product_links al
       JOIN products p ON p.id = al.product_id
       WHERE al.store_id = $1 AND al.ad_ref = $2 LIMIT 1`,
      [storeId, adRef]
    );

    if (rows[0]) {
      console.log(`[AdRef] Matched product "${rows[0].name}" via explicit link for ref="${adRef}"`);
      return { ...rows[0], price: Number(rows[0].price) };
    }

    // 2. Fallback: fuzzy match by product name
    const { rows: fuzzyRows } = await pool.query(
      `SELECT id, name, price, image_url as "imageUrl"
       FROM products
       WHERE store_id = $1
         AND is_active = true
         AND LOWER(name) LIKE LOWER($2)
       LIMIT 1`,
      [storeId, `%${adRef}%`]
    );

    if (fuzzyRows[0]) {
      console.log(`[AdRef] Fuzzy matched product "${fuzzyRows[0].name}" for ref="${adRef}"`);
      return { ...fuzzyRows[0], price: Number(fuzzyRows[0].price) };
    }

    return null;
  } catch (err) {
    console.error("[AdRef] Lookup error:", err);
    return null;
  }
}

// Build AI system prompt with product context
export function buildAdProductPrompt(basePrompt: string | undefined, product: { name: string; price: number; imageUrl?: string } | null): string | undefined {
  if (!product) return basePrompt;
  return `${basePrompt || ""}

IMPORTANT — AD CONTEXT: This customer came from an advertisement for a specific product. Focus your conversation on this product:
- Product: ${product.name}
- Price: ${product.price.toLocaleString()} DZD
${product.imageUrl ? `- Image available: ${product.imageUrl}` : ""}

Start by greeting the customer and presenting this product. Do not ask which product they want — they already know. Directly present the price and ask for their order details (name, phone, wilaya, size/color if applicable).`;
}