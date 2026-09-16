// Mirrors the 4 values subscriptions.status can hold (see
// artifacts/api-server/src/lib/subscription-status.ts on the backend) — one
// place for both billing-facing pages (Billing.tsx, Organization.tsx) so a
// failed card or a cancellation reads the same way everywhere instead of
// falling into a generic gray "trialing"-looking badge.
export function getSubscriptionStatusBadge(status: string | undefined): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-green-100 text-green-800" };
    case "trialing":
      return { label: "Trial", className: "bg-blue-100 text-blue-800" };
    case "past_due":
      return { label: "Payment Failed", className: "bg-red-100 text-red-800" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-gray-100 text-gray-600" };
    default:
      return { label: "Free", className: "bg-gray-100 text-gray-600" };
  }
}
