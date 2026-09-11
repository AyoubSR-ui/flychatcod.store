// Shared by the Login and Signup pages: after a Shopify install that had no
// FlyChat account to attach to (GET /install -> /callback), the merchant
// lands here with ?shopify_claim=<token>&shop=<shop> instead of going
// straight into the app. Once they've authenticated (existing account or a
// brand-new signup), this attaches that pending install to their store.
const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

// Returns true if a pending install was present and successfully claimed —
// callers use that to route to /channels instead of the normal post-auth
// redirect. Returns false (never throws) when there's nothing to claim or
// the claim failed, so login/signup still succeeds either way.
export async function claimPendingShopifyInstall(authToken: string): Promise<boolean> {
  const claimToken = new URLSearchParams(window.location.search).get("shopify_claim");
  if (!claimToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/shopify/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({ claimToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
