import { Router } from "express";
import { db, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 0,
    currency: "DZD",
    interval: "month",
    features: ["1 store", "500 chats/month", "Website widget", "Order management", "Customer CRM", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 2900,
    currency: "DZD",
    interval: "month",
    features: ["3 stores", "Unlimited chats", "All Basic features", "Team access (5 agents)", "Advanced analytics", "Priority support", "Canned replies"],
  },
  {
    id: "ai_addon",
    name: "AI Confirmation Add-on",
    price: 1500,
    currency: "DZD",
    interval: "month",
    features: ["AI-powered order confirmation", "Intent detection (coming soon)", "Smart routing (coming soon)", "Voice confirmation (coming soon)", "Add-on to Pro plan"],
  },
];

router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.organizationId) {
      res.json({ id: "none", organizationId: "", plan: "free", status: "trialing", currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false });
      return;
    }

    const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, user.organizationId)).limit(1);
    if (!sub) {
      res.json({ id: "none", organizationId: user.organizationId, plan: "free", status: "trialing", currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false });
      return;
    }
    res.json(sub);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch subscription" });
  }
});

router.get("/plans", async (_req, res) => {
  res.json({ plans: PLANS });
});

export default router;
