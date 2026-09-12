// Shared by the Login and Signup pages: after a Shopify install that had no
// FlyChat account to attach to (GET /install -> /callback), the merchant
// lands here instead of going straight into the app. The claim token starts
// in the URL (?shopify_claim=<token>&shop=<shop>) but index.html's inline
// script moves it into sessionStorage and strips the URL before this (or
// any other script) ever runs, so it survives client-side navigation and
// isn't left sitting in the address bar/history. Once the merchant has
// authenticated (existing account or a brand-new signup), this attaches
// that pending install to their store.
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

// Returns true if a pending install was present and successfully claimed —
// callers use that to route to /channels instead of the normal post-auth
// redirect. Returns false (never throws) when there's nothing to claim or
// the claim failed, so login/signup still succeeds either way. Clears the
// stored token once an attempt has been made (success or definitive
// failure) so a stale token isn't retried indefinitely across page loads.
export async function claimPendingShopifyInstall(authToken: string): Promise<boolean> {
  const claimToken = readPendingClaimToken();
  if (!claimToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/shopify/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ claimToken }),
    });
    if (res.ok || res.status === 400) {
      // 400 covers invalid/expired/already-claimed — retrying won't help.
      // A live-conflict error (409, see /claim) is left in place instead:
      // that's the caller's decision (different Shopify shop already
      // connected), not something to silently drop.
      try { sessionStorage.removeItem("shopify_claim_token"); sessionStorage.removeItem("shopify_claim_shop"); } catch { /* ignore */ }
    }
    return res.ok;
  } catch {
    return false;
  }
}
