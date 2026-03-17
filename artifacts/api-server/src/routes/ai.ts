import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { getAiStatus } from "../lib/ai-credits.js";

const router = Router();

router.get("/status", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.storeId) {
      res.json({ eligible: false, aiEnabled: false, creditsIncluded: 0, creditsExtra: 0, creditsUsed: 0, creditsRemaining: 0, statusLabel: "not_included", resetAt: null });
      return;
    }

    const status = await getAiStatus(user.storeId);
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch AI status" });
  }
});

export default router;
