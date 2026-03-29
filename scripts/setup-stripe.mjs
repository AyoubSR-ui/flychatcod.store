import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });

const PRODUCTS = [
  // ── Subscription plans ────────────────────────────────────────────────
  {
    key: "STRIPE_STARTER_PRICE_ID",
    name: "FlyChat COD — Starter",
    description: "3 channels, 2,000 AI messages/month, 3 team members",
    amount: 1900, // $19.00
    currency: "usd",
    mode: "recurring",
    interval: "month",
  },
  {
    key: "STRIPE_PRO_PRICE_ID",
    name: "FlyChat COD — Pro",
    description: "All 4 channels, 10,000 AI messages/month, 10 team members",
    amount: 4900, // $49.00
    currency: "usd",
    mode: "recurring",
    interval: "month",
  },
  {
    key: "STRIPE_AGENCY_PRICE_ID",
    name: "FlyChat COD — Agency",
    description: "5 stores, 30,000 AI messages/month, unlimited team members",
    amount: 9900, // $99.00
    currency: "usd",
    mode: "recurring",
    interval: "month",
  },
  // ── AI Credit top-ups ────────────────────────────────────────────────
  {
    key: "STRIPE_TOPUP_5K_PRICE_ID",
    name: "FlyChat COD — 5,000 AI Credits",
    description: "5,000 AI message credits top-up",
    amount: 900, // $9.00
    currency: "usd",
    mode: "one_time",
  },
  {
    key: "STRIPE_TOPUP_15K_PRICE_ID",
    name: "FlyChat COD — 15,000 AI Credits",
    description: "15,000 AI message credits top-up",
    amount: 2400, // $24.00
    currency: "usd",
    mode: "one_time",
  },
  {
    key: "STRIPE_TOPUP_50K_PRICE_ID",
    name: "FlyChat COD — 50,000 AI Credits",
    description: "50,000 AI message credits top-up",
    amount: 6900, // $69.00
    currency: "usd",
    mode: "one_time",
  },
];

async function setup() {
  console.log("🚀 Setting up Stripe products and prices...\n");
  const results = {};

  for (const product of PRODUCTS) {
    try {
      // Create product
      const stripeProduct = await stripe.products.create({
        name: product.name,
        description: product.description,
      });

      // Create price
      const priceParams = {
        product: stripeProduct.id,
        currency: product.currency,
        unit_amount: product.amount,
      };

      if (product.mode === "recurring") {
        priceParams.recurring = { interval: product.interval };
      }

      const price = await stripe.prices.create(priceParams);

      results[product.key] = price.id;
      console.log(`✅ ${product.name}`);
      console.log(`   Product ID: ${stripeProduct.id}`);
      console.log(`   Price ID:   ${price.id}`);
      console.log(`   → ${product.key}=${price.id}\n`);
    } catch (err) {
      console.error(`❌ Failed to create ${product.name}:`, err.message);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("📋 Add these to Railway api-server Variables:");
  console.log("=".repeat(60));
  for (const [key, value] of Object.entries(results)) {
    console.log(`${key}=${value}`);
  }
  console.log("=".repeat(60));
}

setup();
