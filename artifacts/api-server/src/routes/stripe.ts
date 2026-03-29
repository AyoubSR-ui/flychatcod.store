import { Router } from "express";
import Stripe from "stripe";
import { db, pool, subscriptionsTable, storesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-03-25.dahlia",
});

const FRONTEND_URL = process.env.FRONTEND_URL || "https://flychatcodstore-production-a2e8.up.railway.app";

// ─── Price IDs from env ───────────────────────────────────────────────────────
const PRICE_IDS = {
  starter:    process.env.STRIPE_STARTER_PRICE_ID || "",
  pro:        process.env.STRIPE_PRO_PRICE_ID || "",
  agency:     process.env.STRIPE_AGENCY_PRICE_ID || "",
  topup_5k:   process.env.STRIPE_TOPUP_5K_PRICE_ID || "",
  topup_15k:  process.env.STRIPE_TOPUP_15K_PRICE_ID || "",
  topup_50k:  process.env.STRIPE_TOPUP_50K_PRICE_ID || "",
};

const TOPUP_CREDITS: Record<string, number> = {
  topup_5k: 5000,
  topup_15k: 15000,
  topup_50k: 50000,
};

const PLAN_CREDITS: Record<string, number> = {
  starter: 2000,
  pro: 10000,
  agency: 30000,
};

// ─── Helper: get or create Stripe customer ────────────────────────────────────
async function getOrCreateStripeCustomer(userId: string, email: string, name: string): Promise<string> {
  // Check if customer already stored
  const { rows } = await pool.query(
    `SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  
  if (rows[0]?.stripe_customer_id) return rows[0].stripe_customer_id;

  // Create new Stripe customer
  const customer = await stripe.customers.create({ email, name });
  
  // Store in users table (add column if needed — we use pool raw query)
  await pool.query(
    `UPDATE users SET stripe_customer_id = $1 WHERE id = $2`,
    [customer.id, userId]
  ).catch(() => {}); // column may not exist yet — handled gracefully

  return customer.id;
}

// ─── POST /api/stripe/create-checkout ────────────────────────────────────────
router.post("/create-checkout", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { priceKey, annual = false } = req.body;

    if (!priceKey || !PRICE_IDS[priceKey as keyof typeof PRICE_IDS]) {
      res.status(400).json({ error: "invalid_price", message: "Invalid price key" });
      return;
    }

    const priceId = PRICE_IDS[priceKey as keyof typeof PRICE_IDS];
    const isTopUp = priceKey.startsWith("topup_");
    const isSubscription = !isTopUp;

    const customerId = await getOrCreateStripeCustomer(
      user.id,
      user.email,
      user.name
    );

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      payment_method_types: ["card"],
      success_url: `${FRONTEND_URL}/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/billing?canceled=true`,
      metadata: {
        userId: user.id,
        storeId: user.storeId || "",
        priceKey,
        organizationId: user.organizationId || "",
      },
    };

    if (isSubscription) {
      sessionParams.mode = "subscription";
      sessionParams.line_items = [{ price: priceId, quantity: 1 }];
      if (annual) {
        // Annual discount — apply coupon or use annual price ID
        sessionParams.discounts = [];
      }
    } else {
      // One-time top-up
      sessionParams.mode = "payment";
      sessionParams.line_items = [{ price: priceId, quantity: 1 }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error("[Stripe] Create checkout error:", err);
    res.status(500).json({ error: "stripe_error", message: err.message });
  }
});

// ─── GET /api/stripe/portal ───────────────────────────────────────────────────
router.get("/portal", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { rows } = await pool.query(
      `SELECT stripe_customer_id FROM users WHERE id = $1 LIMIT 1`,
      [user.id]
    ).catch(() => ({ rows: [] }));

    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) {
      res.status(400).json({ error: "no_customer", message: "No Stripe customer found. Please subscribe first." });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${FRONTEND_URL}/billing`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[Stripe] Portal error:", err);
    res.status(500).json({ error: "stripe_error", message: err.message });
  }
});

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error("[Stripe] Webhook signature error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {

      // ── Subscription created or updated ──────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const { userId, storeId, priceKey, organizationId } = session.metadata || {};
        if (!organizationId) break;

        const isTopUp = priceKey?.startsWith("topup_");

        if (isTopUp) {
          // Add credits to subscription
          const credits = TOPUP_CREDITS[priceKey] || 0;
          await db.update(subscriptionsTable).set({
            aiExtraCreditsPurchased: db
              .select({ v: subscriptionsTable.aiExtraCreditsPurchased })
              .from(subscriptionsTable)
              .where(eq(subscriptionsTable.organizationId, organizationId))
              .then(() => 0) as any, // handled below
            updatedAt: new Date(),
          }).where(eq(subscriptionsTable.organizationId, organizationId));

          // Use raw SQL for increment
          await pool.query(
            `UPDATE subscriptions SET ai_extra_credits_purchased = ai_extra_credits_purchased + $1, updated_at = NOW() WHERE organization_id = $2`,
            [credits, organizationId]
          );
          console.log(`[Stripe] Added ${credits} credits to org ${organizationId}`);

        } else if (session.mode === "subscription") {
          // Subscription checkout completed — subscription.created will handle plan update
          console.log(`[Stripe] Subscription checkout completed for org ${organizationId}`);
        }
        break;
      }

      // ── Subscription activated ────────────────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Find user by stripe customer id
        const { rows } = await pool.query(
          `SELECT u.organization_id FROM users u WHERE u.stripe_customer_id = $1 LIMIT 1`,
          [customerId]
        ).catch(() => ({ rows: [] }));

        const organizationId = rows[0]?.organization_id;
        if (!organizationId) break;

        // Get price ID from subscription
        const priceId = subscription.items.data[0]?.price.id;
        const planEntry = Object.entries(PRICE_IDS).find(([, pid]) => pid === priceId);
        const planKey = planEntry?.[0] as string | undefined;

        if (!planKey || planKey.startsWith("topup_")) break;

        const periodEnd = subscription.items.data[0]?.current_period_end
          ? new Date(subscription.items.data[0].current_period_end * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const periodStart = subscription.items.data[0]?.current_period_start
         ? new Date(subscription.items.data[0].current_period_start * 1000)
         : new Date();
        
        const monthlyCredits = PLAN_CREDITS[planKey] || 0;

        await pool.query(
          `UPDATE subscriptions SET 
            plan = $1, 
            status = $2,
            current_period_start = $3,
            current_period_end = $4,
            ai_monthly_credits_included = $5,
            ai_credits_reset_at = $4,
            external_subscription_id = $6,
            updated_at = NOW()
          WHERE organization_id = $7`,
          [planKey, subscription.status === "active" ? "active" : "trialing", periodStart, periodEnd, monthlyCredits, subscription.id, organizationId]
        );
        console.log(`[Stripe] Updated plan to ${planKey} for org ${organizationId}`);
        break;
      }

      // ── Subscription cancelled ────────────────────────────────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { rows } = await pool.query(
          `SELECT u.organization_id FROM users u WHERE u.stripe_customer_id = $1 LIMIT 1`,
          [customerId]
        ).catch(() => ({ rows: [] }));

        const organizationId = rows[0]?.organization_id;
        if (!organizationId) break;

        await pool.query(
          `UPDATE subscriptions SET plan = 'free', status = 'active', ai_monthly_credits_included = 50, updated_at = NOW() WHERE organization_id = $1`,
          [organizationId]
        );
        console.log(`[Stripe] Subscription cancelled — downgraded to free for org ${organizationId}`);
        break;
      }

      // ── Invoice paid (recurring renewal) ─────────────────────────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { rows } = await pool.query(
          `SELECT u.organization_id FROM users u WHERE u.stripe_customer_id = $1 LIMIT 1`,
          [customerId]
        ).catch(() => ({ rows: [] }));

        const organizationId = rows[0]?.organization_id;
        if (!organizationId) break;

        // Reset monthly credits on renewal
        await pool.query(
          `UPDATE subscriptions SET 
            ai_credits_used_current_period = 0,
            ai_credits_reset_at = NOW() + INTERVAL '1 month',
            updated_at = NOW()
          WHERE organization_id = $1`,
          [organizationId]
        );
        console.log(`[Stripe] Invoice paid — reset credits for org ${organizationId}`);
        break;
      }
    }
  } catch (err) {
    console.error("[Stripe] Webhook handler error:", err);
  }

  res.json({ received: true });
});

export default router;