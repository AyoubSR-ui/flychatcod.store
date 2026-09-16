import Stripe from "stripe";
import { pool } from "@workspace/db";

// Our subscriptions.status enum only has 4 values (lib/db/src/schema/billing.ts)
// — Stripe has 8. This is the one place that decides how Stripe's finer-grained
// status buckets down to ours, so a future access-control layer (deliberately
// not built yet — this task is storage only) has a single source of truth to
// read from instead of re-deriving the mapping per call site.
export type OurSubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled";

const STRIPE_STATUS_MAP: Record<Stripe.Subscription.Status, OurSubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  // Stripe gives up retrying and stops billing — still a payment problem,
  // not yet a cancellation.
  unpaid: "past_due",
  // Initial payment never went through / requires action — same bucket as
  // past_due rather than trialing, since the reason access would be in
  // question is a payment problem either way.
  incomplete: "past_due",
  // The subscription never activated and Stripe auto-voided it — this is
  // functionally a cancellation, not an in-progress payment issue.
  incomplete_expired: "cancelled",
  canceled: "cancelled",
  // Merchant-initiated pause (pause_collection), not a payment failure —
  // closest to "not currently paying, but not being denied for cause."
  paused: "trialing",
};

export function mapStripeStatus(status: Stripe.Subscription.Status): OurSubscriptionStatus {
  return STRIPE_STATUS_MAP[status] ?? "trialing";
}

// Every subscription webhook handler needs to turn a Stripe customer id into
// the organization it belongs to — pulled out once instead of repeating the
// same query in each case block.
export async function getOrganizationIdForStripeCustomer(customerId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT u.organization_id FROM users u WHERE u.stripe_customer_id = $1 LIMIT 1`,
    [customerId]
  ).catch(() => ({ rows: [] as { organization_id: string }[] }));
  return rows[0]?.organization_id ?? null;
}
