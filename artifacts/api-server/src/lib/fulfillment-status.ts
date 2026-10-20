// ─── Carrier status → FlyChat shipment_status mapping ──────────────────────────
// Single place every carrier adapter's raw tracking status gets translated into
// shipments.status (see lib/db/src/schema/carriers.ts's shipmentStatusEnum).
// Adapters return their carrier's own raw vocabulary unmapped (see
// CarrierAdapter.getStatus/getStatusBatch in carriers/types.ts) specifically so
// this is the only file that needs extending when a carrier's wording is seen
// for the first time — never add a second mapping table next to an adapter.
//
// Rule: an unrecognized raw status returns undefined. Callers must leave the
// order's shipment_status untouched and log the raw value distinctly in that
// case — never guess a bucket for a status this file doesn't know about yet.

export type ShipmentStatus =
  | "not_shipped" | "label_created" | "label_purchased" | "label_printed"
  | "confirmed" | "in_transit" | "out_for_delivery" | "delivered" | "failed"
  | "cancelled" | "returned";

// ── Ecotrack (one shared white-label platform — see carriers/ecotrack.ts's
// ECOTRACK_TENANTS; every tenant speaks this same status vocabulary) ──
//
// Verified two ways: (1) cross-referenced against bighadj22/codflow's
// status-mapping.ts, an independently-built, test-covered Ecotrack
// integration (its own STATUS_MAP, Slice 11 in CONFORMANCE.md); (2) directly
// observed live via GET api/v1/get/orders/status against two real FlyChat
// connections (anderson_ecotrack) — prete_a_expedier, encaisse_non_paye, and
// retour_recu were all seen on real orders, matching CodFlow's table exactly.
//
// CodFlow's own enum is coarser than ours (no in_transit/out_for_delivery
// split — everything pre-final-mile is one "dispatched" bucket). Since our
// shipment_status enum already distinguishes in_transit from out_for_delivery,
// the early/mid-pipeline statuses are split further here rather than copying
// CodFlow's bucketing exactly:
//   - still at the origin hub, not yet moving toward the destination wilaya
//     -> "confirmed" (carrier has accepted the parcel)
//   - moving through the carrier's hub network toward the destination
//     -> "in_transit"
//   - out with a courier for final-mile delivery (home or stop-desk pickup
//     ready) -> "out_for_delivery"
// CONFORMANCE.md's own caveat applies: "tenant drift is expected — status
// label wording drifts per tenant." This table is Anderson-verified; if a
// different tenant is ever seen using different wording for the same
// concept, extend this map rather than assume it's universal.
const ECOTRACK_STATUS_MAP: Record<string, ShipmentStatus> = {
  // Accepted by the carrier, still at origin.
  prete_a_expedier: "confirmed",
  prete_a_preparer: "confirmed",
  en_preparation_stock: "confirmed",
  en_ramassage: "confirmed",
  en_preparation: "confirmed",
  // Moving through the carrier's hub network toward the destination wilaya.
  vers_hub: "in_transit",
  en_hub: "in_transit",
  vers_wilaya: "in_transit",
  // suspendu = carrier couldn't reach the customer / delivery paused —
  // genuinely ambiguous (not terminal, not resolved). CodFlow has a dedicated
  // "unreachable" bucket we don't; mapping to in_transit rather than failed
  // is a deliberate choice not to mark a retryable hold as a hard failure.
  suspendu: "in_transit",
  // Final-mile: with a courier, or arrived at a stop-desk awaiting pickup.
  en_livraison: "out_for_delivery",
  // Terminal: delivered (encaisse_non_paye etc. differ only in whether the
  // carrier has remitted payment to the merchant yet — all mean the parcel
  // itself was handed to the customer).
  livre_non_encaisse: "delivered",
  encaisse_non_paye: "delivered",
  paiements_prets: "delivered",
  paye_et_archive: "delivered",
  // Terminal: returned to sender. A returned COD parcel is its own terminal
  // outcome, not a flavor of "failed" — see shipment_status's "returned" value.
  retour_chez_livreur: "returned",
  retour_transit_entrepot: "returned",
  retour_en_traitement: "returned",
  retour_recu: "returned",
  retour_archive: "returned",
  // Terminal: cancelled.
  annule: "cancelled",
};

// Dispatches by carrier family. Every Ecotrack tenant (anderson_ecotrack,
// dhd, golivri, ...) is the same underlying platform and shares this table —
// see ECOTRACK_TENANTS in carriers/ecotrack.ts. Carriers with no mapping
// table yet (Yalidine, ZR Express, Maystro, Noest — all "not_available" in
// the registry today, so this is currently dead code for them in practice)
// fall through to undefined, same as any unrecognized raw status.
export function mapCarrierStatus(carrier: string, rawStatus: string): ShipmentStatus | undefined {
  if (isEcotrackCarrier(carrier)) return ECOTRACK_STATUS_MAP[rawStatus];
  return undefined;
}

// Kept here (not imported from ecotrack.ts) to avoid a circular import —
// ecotrack.ts will import mapCarrierStatus from this file. The actual
// ECOTRACK_TENANTS id list is the source of truth; this only needs to know
// "is this carrier id one of them," which a plain set mirrors cheaply.
const ECOTRACK_CARRIER_IDS = new Set([
  "anderson_ecotrack", "dhd", "areex", "ba_consult", "conexlog", "coyote_express",
  "distazero", "e48hr_livraison", "fretdirect", "golivri", "mono_hub", "msm_go",
  "negmar_express", "packers", "prest", "rb_livraison", "rex_livraison",
  "rocket_delivery", "salva_delivery", "speed_delivery", "tsl_express", "world_express",
]);
function isEcotrackCarrier(carrier: string): boolean {
  return ECOTRACK_CARRIER_IDS.has(carrier);
}

// Shipment statuses that represent a finished parcel lifecycle — once here,
// the poller stops selecting the order (see delivery-tracking.ts's WHERE
// clause) and Delivery Rate / per-agent delivered counts treat it as settled.
export const TERMINAL_SHIPMENT_STATUSES: readonly ShipmentStatus[] = ["delivered", "cancelled", "returned"];
