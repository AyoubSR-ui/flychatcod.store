import { Router, Request, Response, NextFunction } from "express";
import { db, pool, subscriptionsTable, storesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { getAiStatus } from "../lib/ai-credits.js";

// ── Agent-secret middleware (for Python optimizer calls) ──────────────────────
function requireAgentSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.AGENT_SECRET;
  const provided = req.headers["x-agent-secret"];
  if (!secret || provided !== secret) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

// ── Ensure optimizer_runs table exists (lazy init on first request) ───────────
let optimizerTableReady = false;
async function ensureOptimizerTable() {
  if (optimizerTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS optimizer_runs (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      selected_model TEXT,
      provider TEXT,
      conversations_requested INT DEFAULT 0,
      conversations_processed INT DEFAULT 0,
      batch_count INT DEFAULT 0,
      status TEXT DEFAULT 'pending',
      estimated_input_tokens INT DEFAULT 0,
      estimated_output_tokens INT DEFAULT 0,
      actual_input_tokens INT DEFAULT 0,
      actual_output_tokens INT DEFAULT 0,
      estimated_provider_cost_usd DECIMAL(10,6) DEFAULT 0,
      actual_provider_cost_usd DECIMAL(10,6) DEFAULT 0,
      estimated_credit_charge INT DEFAULT 0,
      actual_credit_charge INT DEFAULT 0,
      credits_reserved INT DEFAULT 0,
      credits_finalized INT DEFAULT 0,
      margin_target DECIMAL(5,2) DEFAULT 25.0,
      created_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    )
  `);
  optimizerTableReady = true;
}

const router = Router();

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    currency: "USD",
    interval: "month",
    aiCredits: 20,
    badge: null,
    description: "Perfect for testing FlyChat with your store.",
    features: [
      "1 channel (Widget only)",
      "20 AI messages/month",
      "Up to 50 orders/month",
      "1 team member",
      "Basic inbox",
      "FlyChat branding on widget",
    ],
    limits: { channels: 1, orders: 50, aiCredits: 20, teamMembers: 1, automationRules: 0 },
  },
  {
    id: "starter",
    name: "Starter",
    price: 19,
    currency: "USD",
    interval: "month",
    aiCredits: 1500,
    badge: null,
    description: "For growing sellers ready to scale with WhatsApp.",
    trial: 14,
    features: [
      "3 channels (Widget + WhatsApp + 1 other)",
      "1,500 AI messages/month",
      "Unlimited orders",
      "3 team members",
      "Full inbox — all channels",
      "Basic automation (3 rules)",
      "No FlyChat branding",
    ],
    limits: { channels: 3, orders: -1, aiCredits: 1500, teamMembers: 3, automationRules: 3 },
  },
  {
    id: "pro",
    name: "Pro",
    price: 49,
    currency: "USD",
    interval: "month",
    aiCredits: 7000,
    badge: "Most Popular",
    description: "Full power for serious COD sellers.",
    trial: 14,
    features: [
      "All 4 channels (WhatsApp + Instagram + Messenger + Widget)",
      "7,000 AI messages/month",
      "Unlimited orders",
      "10 team members",
      "Advanced automation (unlimited rules)",
      "AI autopilot per channel",
      "Priority support",
    ],
    limits: { channels: 4, orders: -1, aiCredits: 7000, teamMembers: 10, automationRules: -1 },
  },
  {
    id: "agency",
    name: "Agency",
    price: 99,
    currency: "USD",
    interval: "month",
    aiCredits: 15000,
    badge: null,
    description: "For agencies managing multiple stores.",
    trial: 14,
    features: [
      "Everything in Pro",
      "Up to 5 stores",
      "15,000 AI messages/month",
      "Unlimited team members",
      "White-label (custom branding)",
      "Dedicated support",
    ],
    limits: { channels: 4, orders: -1, aiCredits: 15000, teamMembers: -1, automationRules: -1 },
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

router.post("/top-up", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    if (!user.organizationId) { res.status(400).json({ error: "no_org" }); return; }

    const TOP_UP_OPTIONS: Record<string, { credits: number; price: number }> = {
      topup_5k:  { credits: 5000,  price: 9  },
      topup_15k: { credits: 15000, price: 24 },
      topup_50k: { credits: 50000, price: 69 },
    };

    const { topUpId } = req.body;
    const option = TOP_UP_OPTIONS[topUpId];
    if (!option) { res.status(400).json({ error: "invalid_topup" }); return; }

    // TODO: integrate payment gateway (Stripe etc.)
    // For now return payment_required with amount
    res.status(402).json({
      error: "payment_required",
      message: "Payment integration coming soon.",
      amount: option.price,
      credits: option.credits,
      currency: "USD",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── Optimizer Credit Endpoints (called by Python agent, not browser) ─────────

// GET /api/billing/credits/:storeId
router.get("/credits/:storeId", requireAgentSecret, async (req, res) => {
  try {
    const { storeId } = req.params;
    const status = await getAiStatus(storeId);
    res.json({ credits_remaining: status.creditsRemaining });
  } catch (err) {
    console.error("[Billing] credits fetch error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/billing/credits/reserve
router.post("/credits/reserve", requireAgentSecret, async (req, res) => {
  try {
    await ensureOptimizerTable();
    const { storeId, amount, runId } = req.body as { storeId: string; amount: number; runId: string };

    // Get organization id for this store
    const [store] = await db.select({ organizationId: storesTable.organizationId })
      .from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    if (!store) { res.status(404).json({ error: "store_not_found" }); return; }

    // Increment used credits to reserve them (fail if not enough)
    const result = await db.update(subscriptionsTable).set({
      aiCreditsUsedCurrentPeriod: sql`${subscriptionsTable.aiCreditsUsedCurrentPeriod} + ${amount}`,
      updatedAt: new Date(),
    }).where(eq(subscriptionsTable.organizationId, store.organizationId)).returning({
      used: subscriptionsTable.aiCreditsUsedCurrentPeriod,
      included: subscriptionsTable.aiMonthlyCreditsIncluded,
      extra: subscriptionsTable.aiExtraCreditsPurchased,
    });

    if (!result.length) { res.status(404).json({ error: "subscription_not_found" }); return; }

    // Log reservation in optimizer_runs
    await pool.query(
      `INSERT INTO optimizer_runs (id, store_id, status, credits_reserved, created_at)
       VALUES ($1, $2, 'running', $3, NOW())
       ON CONFLICT (id) DO UPDATE SET credits_reserved = $3, status = 'running'`,
      [runId, storeId, amount]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[Billing] reserve error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/billing/credits/finalize
router.post("/credits/finalize", requireAgentSecret, async (req, res) => {
  try {
    await ensureOptimizerTable();
    const { storeId, runId, actualAmount } = req.body as { storeId: string; runId: string; actualAmount: number };

    // Get reserved amount to compute refund
    const { rows } = await pool.query<{ credits_reserved: number }>(
      `SELECT credits_reserved FROM optimizer_runs WHERE id = $1`,
      [runId]
    );
    const reserved = rows[0]?.credits_reserved ?? actualAmount;
    const refund = Math.max(0, reserved - actualAmount);

    if (refund > 0) {
      const [store] = await db.select({ organizationId: storesTable.organizationId })
        .from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
      if (store) {
        await db.update(subscriptionsTable).set({
          aiCreditsUsedCurrentPeriod: sql`GREATEST(0, ${subscriptionsTable.aiCreditsUsedCurrentPeriod} - ${refund})`,
          updatedAt: new Date(),
        }).where(eq(subscriptionsTable.organizationId, store.organizationId));
      }
    }

    await pool.query(
      `UPDATE optimizer_runs
       SET status = 'completed', credits_finalized = $1, actual_credit_charge = $2, completed_at = NOW()
       WHERE id = $3`,
      [actualAmount, actualAmount, runId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[Billing] finalize error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/billing/credits/release
router.post("/credits/release", requireAgentSecret, async (req, res) => {
  try {
    await ensureOptimizerTable();
    const { storeId, runId } = req.body as { storeId: string; runId: string };

    const { rows } = await pool.query<{ credits_reserved: number }>(
      `SELECT credits_reserved FROM optimizer_runs WHERE id = $1`,
      [runId]
    );
    const reserved = rows[0]?.credits_reserved ?? 0;

    if (reserved > 0) {
      const [store] = await db.select({ organizationId: storesTable.organizationId })
        .from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
      if (store) {
        await db.update(subscriptionsTable).set({
          aiCreditsUsedCurrentPeriod: sql`GREATEST(0, ${subscriptionsTable.aiCreditsUsedCurrentPeriod} - ${reserved})`,
          updatedAt: new Date(),
        }).where(eq(subscriptionsTable.organizationId, store.organizationId));
      }
    }

    await pool.query(
      `UPDATE optimizer_runs SET status = 'failed', completed_at = NOW() WHERE id = $1`,
      [runId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[Billing] release error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;