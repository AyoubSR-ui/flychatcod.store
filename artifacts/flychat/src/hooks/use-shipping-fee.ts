import { useEffect, useState } from "react";

// GET /api/settings/shipping-price?wilaya=&type= — the store's own configured
// price (Settings → Shipping), by wilaya and delivery type. Already used by
// the Inbox draft before this; extracted here so the create-order modal and
// OrderDetail can reuse the exact same source instead of leaving Shipping
// Fee at 0.
const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";

export type ShippingDeliveryType = "home_delivery" | "stopdesk";

export async function fetchShippingFee(wilaya: string, deliveryType: ShippingDeliveryType): Promise<number | null> {
  if (!wilaya) return null;
  const token = localStorage.getItem("flychat_token");
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/settings/shipping-price?wilaya=${encodeURIComponent(wilaya)}&type=${deliveryType}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Number(data.price || 0);
  } catch {
    return null;
  }
}

// Auto-fill hook for a FRESH order being built (create-order modal, Inbox
// draft): refetches whenever wilaya/deliveryType change, and calls onFee with
// the result — UNLESS manuallyEdited is true, in which case it does nothing
// at all, so a fee the agent typed by hand is never silently replaced.
//
// NOT for OrderDetail (an existing order): that page must not change a
// stored order's fee just because it renders — see fetchShippingFee above,
// called directly from OrderDetail's own wilaya/delivery-type change
// handlers instead, so a fetch only ever happens in response to an agent
// actively changing one of those two fields, never on mount.
export function useShippingFeeAutofill(
  wilaya: string,
  deliveryType: ShippingDeliveryType,
  manuallyEdited: boolean,
  onFee: (fee: number) => void
): boolean {
  const [fetching, setFetching] = useState(false);
  useEffect(() => {
    if (!wilaya || manuallyEdited) return;
    let cancelled = false;
    setFetching(true);
    fetchShippingFee(wilaya, deliveryType)
      .then(price => { if (!cancelled && price != null) onFee(price); })
      .finally(() => { if (!cancelled) setFetching(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wilaya, deliveryType, manuallyEdited]);
  return fetching;
}
