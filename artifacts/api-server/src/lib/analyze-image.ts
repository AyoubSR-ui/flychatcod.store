import { pool } from "@workspace/db";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface ImageAnalysisResult {
  description: string;
  usedVision: boolean;
}

/**
 * Analyze an image by:
 * 1. DB product imageUrl match (free — returns product name/description)
 * 2. gpt-4o Vision fallback (~$0.002)
 */
export async function analyzeImage(
  imageUrl: string,
  imageAccessToken: string | undefined,
  storeId: string,
): Promise<ImageAnalysisResult> {
  // ── 1. DB product URL match (free) ─────────────────────────────────────────
  try {
    const { rows } = await pool.query(
      `SELECT name, description FROM products WHERE store_id = $1 AND image_url = $2 LIMIT 1`,
      [storeId, imageUrl],
    );
    if (rows.length > 0) {
      const p = rows[0];
      const desc = p.description
        ? `📷 Product image: "${p.name}" — ${p.description}`
        : `📷 Product image: "${p.name}"`;
      console.log(`[analyzeImage] DB match for store ${storeId}: "${p.name}"`);
      return { description: desc, usedVision: false };
    }
  } catch (err: any) {
    console.error("[analyzeImage] DB lookup failed:", err?.message);
  }

  // ── 2. gpt-4o Vision fallback ───────────────────────────────────────────────
  if (!OPENAI_API_KEY) {
    console.warn("[analyzeImage] OPENAI_API_KEY not set — skipping Vision");
    return { description: "📷 [Image attached]", usedVision: false };
  }

  try {
    // WhatsApp CDN URLs require Bearer auth; Messenger/Instagram fbcdn URLs are public.
    // We download and base64-encode when an access token is provided, otherwise use URL directly.
    let visionContent: object;

    if (imageAccessToken) {
      const imgRes = await fetch(imageUrl, {
        headers: { Authorization: `Bearer ${imageAccessToken}` },
      });
      if (!imgRes.ok) {
        console.error(`[analyzeImage] Failed to download image (${imgRes.status})`);
        return { description: "📷 [Image attached]", usedVision: false };
      }
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      visionContent = {
        type: "image_url",
        image_url: { url: `data:${contentType};base64,${base64}`, detail: "low" },
      };
    } else {
      visionContent = { type: "image_url", image_url: { url: imageUrl, detail: "low" } };
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              visionContent,
              {
                type: "text",
                text: "Describe this image in 1-2 sentences. Focus on what product or item is shown, its color, and any visible text or brand. Be concise.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[analyzeImage] OpenAI Vision error:", err.substring(0, 300));
      return { description: "📷 [Image attached — analysis failed]", usedVision: false };
    }

    const data = (await res.json()) as any;
    const text = data.choices?.[0]?.message?.content?.trim() || "[Image]";
    console.log(`[analyzeImage] Vision result: ${text.substring(0, 80)}`);
    return { description: `📷 ${text}`, usedVision: true };
  } catch (err: any) {
    console.error("[analyzeImage] Vision fallback exception:", err?.message);
    return { description: "📷 [Image attached]", usedVision: false };
  }
}
