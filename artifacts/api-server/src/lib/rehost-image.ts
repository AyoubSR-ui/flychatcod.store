import { v2 as cloudinary } from "cloudinary";

const CLOUDINARY_URL = process.env.CLOUDINARY_URL || "";
const cloudinaryEnabled = CLOUDINARY_URL.startsWith("cloudinary://");
if (cloudinaryEnabled) {
  cloudinary.config({ cloudinary_url: CLOUDINARY_URL });
}

// WhatsApp media URLs require a Bearer token and expire quickly — a plain
// <img src> can't send that header, and the URL may be dead by the time the
// merchant opens the conversation. Downloading once and re-hosting on
// Cloudinary (already used for product images) gives a durable, public URL.
export async function rehostImage(sourceUrl: string, accessToken: string): Promise<string | null> {
  if (!cloudinaryEnabled) return null;
  try {
    const res = await fetch(sourceUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      console.error(`[RehostImage] Download failed: ${res.status}`);
      return null;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "flychat-chat-media", resource_type: "image" },
        (err, result) => { if (err || !result) reject(err ?? new Error("Upload failed")); else resolve(result as { secure_url: string }); }
      );
      stream.end(buffer);
    });
    return result.secure_url;
  } catch (err) {
    console.error("[RehostImage] Failed:", err);
    return null;
  }
}
