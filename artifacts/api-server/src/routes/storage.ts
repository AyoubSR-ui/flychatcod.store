import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { requireAuth } from "../middlewares/auth.js";

const router: IRouter = Router();

// Cloudinary is configured automatically from CLOUDINARY_URL env var
// Format: cloudinary://API_KEY:API_SECRET@CLOUD_NAME
const CLOUDINARY_URL = process.env.CLOUDINARY_URL || "";
const cloudinaryEnabled = CLOUDINARY_URL.startsWith("cloudinary://");
if (cloudinaryEnabled) {
  cloudinary.config({ cloudinary_url: CLOUDINARY_URL });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// POST /api/storage/upload — accepts multipart file, uploads to Cloudinary
router.post(
  "/storage/upload",
  requireAuth,
  upload.single("file"),
  async (req: Request, res: Response) => {
    if (!cloudinaryEnabled) {
      res.status(503).json({
        error: "storage_not_configured",
        message: "Set CLOUDINARY_URL env var to enable image uploads.",
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "no_file", message: "No file uploaded" });
      return;
    }

    try {
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "flychat-products", resource_type: "image" },
          (err, result) => {
            if (err || !result) reject(err ?? new Error("Upload failed"));
            else resolve(result as { secure_url: string });
          }
        );
        stream.end(req.file!.buffer);
      });

      res.json({ url: result.secure_url });
    } catch (err) {
      console.error("[Storage] Cloudinary upload failed:", err);
      res.status(500).json({ error: "upload_failed", message: "Image upload failed" });
    }
  }
);

export default router;
