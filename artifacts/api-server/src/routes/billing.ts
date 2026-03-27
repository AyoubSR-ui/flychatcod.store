import { Router } from "express";
import { db, subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getAiStatus } from "../lib/ai-credits.js";

const router = Router();

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    currency: "USD",
    interval: "month",
    aiCredits: 50,
    badge: null,
    description: "Perfect for testing FlyChat with your store.",
    features: [
      "1 channel (Widget only)",
      "50 AI messages/month",
      "Up to 50 orders/month",
      "1 team member",
      "Basic inbox",
      "FlyChat branding on widget",
    ],
    limits: { channels: 1, orders: 50, aiCredits: 50, teamMembers: 1, automationRules: 0 },
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    currency: "USD",
    interval: "month",
    aiCredits: 2000,
    badge: null,
    description: "For growing sellers ready to scale with WhatsApp.",
    trial: 14,
    features: [
      "3 channels (Widget + WhatsApp + 1 other)",
      "2,000 AI messages/month",
      "Unlimited orders",
      "3 team members",
      "Full inbox — all channels",
      "Basic automation (3 rules)",
      "No FlyChat branding",
    ],
    limits: { channels: 3, orders: -1, aiCredits: 2000, teamMembers: 3, automationRules: 3 },
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    currency: "USD",
    interval: "month",
    aiCredits: 10000,
    badge: "Most Popular",
    description: "Full power for serious COD sellers.",
    trial: 14,
    features: [
      "All 4 channels (WhatsApp + Instagram + Messenger + Widget)",
      "10,000 AI messages/month",
      "Unlimited orders",
      "10 team members",
      "Advanced automation (unlimited rules)",
      "AI autopilot per channel",
      "Priority support",
    ],
    limits: { channels: 4, orders: -1, aiCredits: 10000, teamMembers: 10, automationRules: -1 },
  },
  {
    id: "agency",
    name: "Agency",
    price: 99,
    currency: "USD",
    interval: "month",
    aiCredits: 30000,
    badge: null,
    description: "For agencies managing multiple stores.",
    trial: 14,
    features: [
      "Everything in Pro",
      "Up to 5 stores",
      "30,000 AI messages/month",
      "Unlimited team members",
      "White-label (custom branding)",
      "Dedicated support",
    ],
    limits: { channels: 4, orders: -1, aiCredits: 30000, teamMembers: -1, automationRules: -1 },
  },
];

const TOP_UPS = [
  { id: "topup_5k", credits: 5000, label: "5K", price: 9, currency: "USD" },
  { id: "topup_15k", credits: 15000, label: "15K", price: 24, currency: "USD" },
  { id: "topup_50k", credits: 50000, label: "50K", price: 69, currency: "USD" },
];

router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.organizationId) {
      res.json({ id: "none", organizationId: "", plan: "free", status: "trialing", currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false, aiMonthlyCreditsIncluded: 0, aiExtraCreditsPurchased: 0, aiCreditsUsedCurrentPeriod: 0, aiCreditsResetAt: null });
      return;
    }
    const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, user.organizationId)).limit(1);
    if (!sub) {
      res.json({ id: "none", organizationId: user.organizationId, plan: "free", status: "trialing", currentPeriodStart: new Date(), currentPeriodEnd: new Date(), cancelAtPeriodEnd: false, aiMonthlyCreditsIncluded: 0, aiExtraCreditsPurchased: 0, aiCreditsUsedCurrentPeriod: 0, aiCreditsResetAt: null });
      return;
    }
    res.json(sub);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch subscription" });
  }
});

router.get("/plans", async (_req, res) => {
  res.json({ plans: PLANS, topUps: TOP_UPS });
});

router.get("/ai-status", requireAuth, async (req, res) => {
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