// Shared by the Login and Signup pages: after a Shopify install that had no
// FlyChat account to attach to (GET /install -> /callback), the merchant
// lands here instead of going straight into the app. The claim token starts
// in the URL (?shopify_claim=<token>&shop=<shop>) but index.html's inline
// script moves it into sessionStorage and strips the URL before this (or
// any other script) ever runs, so it survives client-side navigation and
// isn't left sitting in the address bar/history. Once the merchant has
// authenticated (existing account or a brand-new signup), this attaches
// that pending install to their store. A brand-new signup has no store yet
// (created during onboarding), so the first claim attempt right after
// signup is expected to come back "no_store_yet" — callers must retry once
// onboarding finishes instead of treating that as a dead end.
const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

function readPendingClaimToken(): string | null {
  try {
    return sessionStorage.getItem("shopify_claim_token");
  } catch {
    return null;
  }
}

// Used by Login/Signup to decide whether an already-authenticated visitor
// should be claimed+routed immediately instead of seeing the auth form.
export function hasPendingShopifyClaim(): boolean {
  return !!readPendingClaimToken();
}

export type ClaimResult =
  // No pending token in sessionStorage — nothing to do.
  | { status: "no_pending" }
  // Claimed successfully.
  | { status: "claimed"; shop: string }
  // The account has no store yet (brand-new signup, onboarding not done).
  // The token is deliberately NOT cleared here — the caller must retry once
  // onboarding creates the store, or the pending install is lost forever.
  | { status: "no_store_yet" }
  // Pending install row is genuinely gone/expired/already claimed — retrying
  // won't help, token is cleared.
  | { status: "invalid_or_expired" }
  // Account is already connected to a different live Shopify shop — the
  // caller decides (surface to the user); token is left in place so they can
  // disconnect and retry.
  | { status: "conflict"; message: string }
  // Network/unexpected error — token is left in place so a retry can succeed.
  | { status: "failed" };

// Callers use the returned status to decide how to route and whether to
// surface an error, instead of collapsing everything into a boolean. See
// ClaimResult for what each caller should do.
export async function claimPendingShopifyInstall(authToken: string): Promise<ClaimResult> {
  const claimToken = readPendingClaimToken();
  if (!claimToken) return { status: "no_pending" };

  try {
    const res = await fetch(`${API_BASE}/api/shopify/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ claimToken }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      try { sessionStorage.removeItem("shopify_claim_token"); sessionStorage.removeItem("shopify_claim_shop"); } catch { /* ignore */ }
      return { status: "claimed", shop: data.shop };
    }

    if (res.status === 400 && data.error === "no_store") {
      // Don't clear the token — this account just hasn't finished onboarding
      // yet, the claim is still perfectly valid once a store exists.
      return { status: "no_store_yet" };
    }

    if (res.status === 409) {
      // Live conflict (different shop already connected) — leave the token
      // in place, this is the caller's decision to make, not something to
      // silently drop.
      return { status: "conflict", message: data.message || "This account is already connected to a different Shopify store." };
    }

    if (res.status === 400) {
      // invalid_or_expired_claim (or any other 400) — retrying won't help.
      try { sessionStorage.removeItem("shopify_claim_token"); sessionStorage.removeItem("shopify_claim_shop"); } catch { /* ignore */ }
      return { status: "invalid_or_expired" };
    }

    return { status: "failed" };
  } catch {
    return { status: "failed" };
  }
}
