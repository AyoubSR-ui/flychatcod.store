import { Router } from "express";
import { ALGERIA_WILAYAS } from "../lib/carriers/algeria-communes-data.js";

const router = Router();

// Static reference data (wilaya/commune names), not store-scoped — no auth
// needed, same as GET /billing/plans. Single source of truth: the frontend
// used to bundle its own duplicate copy of this dataset; it now fetches it
// from here instead.
router.get("/wilayas", (_req, res) => {
  res.json({ wilayas: ALGERIA_WILAYAS });
});

export default router;
