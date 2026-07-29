import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult } from "./types.js";
import { getWilayaCode } from "./wilaya-codes.js";
import { normalizeAlgerianPhone } from "./phone-format.js";

// ─── Ecotrack adapter (generic, per-tenant) ────────────────────────────────────
// Real field shape verified from the open-source PiteurStudio/CourierDZ client
// (EcotrackProviderIntegration.php) — not guessed, not from dzship's gateway
// docs. Ecotrack is a shared white-label platform: 20+ Algerian couriers run
// the exact same API on their own subdomain, so one adapter class parameterized
// by tenant domain covers all of them.
//
// Auth: `Authorization: Bearer {token}` header (single credential)
// Create: POST {tenantDomain}api/v1/create/order
//   Success check: response.success === true
// Label: GET {tenantDomain}api/v1/get/order/label?tracking={id} (raw PDF bytes)
// Track/status: NOT implemented in the reference client (throws "not
//   implemented" there too) — no verified endpoint for this yet.
// Cancel: no verified endpoint.
//
// Live: enabled 2026-07-29, explicitly requested and accepted as a real-world
// risk (field shape cross-referenced from CourierDZ, not verified against
// Ecotrack's actual live behavior; no confirmed cancel endpoint exists — a
// wrong first call may not be undoable via the API). Scoped to Ecotrack only;
// Noest/Maystro/ZR Express each have their own separate unresolved gaps and
// remain stubbed.

// Domains sourced from CourierDZ's ShippingProviders, then independently
// DNS-checked against all 22 (2026-07-29) — 2 of the 22 (anderson, world_express)
// had no DNS record at all under CourierDZ's domain and were corrected here
// to the real domains found via direct search + DNS/HTTP verification.
export const ECOTRACK_TENANTS: Record<string, { name: string; domain: string }> = {
  // CourierDZ's domain (anderson.ecotrack.dz) has no DNS record — corrected
  // to anderson-ecommerce.ecotrack.dz, verified via DNS + HTTP response.
  anderson_ecotrack: { name: "Anderson Delivery", domain: "https://anderson-ecommerce.ecotrack.dz/" },
  dhd: { name: "DHD", domain: "https://dhd.ecotrack.dz/" },
  areex: { name: "Areex", domain: "https://areex.ecotrack.dz/" },
  ba_consult: { name: "BA Consult", domain: "https://bacexpress.ecotrack.dz/" },
  conexlog: { name: "Conexlog", domain: "https://app.conexlog-dz.com/" },
  coyote_express: { name: "Coyote Express", domain: "https://coyoteexpressdz.ecotrack.dz/" },
  distazero: { name: "Distazero", domain: "https://distazero.ecotrack.dz/" },
  e48hr_livraison: { name: "48Hr Livraison", domain: "https://48hr.ecotrack.dz/" },
  fretdirect: { name: "FRET.Direct", domain: "https://fret.ecotrack.dz/" },
  golivri: { name: "GOLIVRI", domain: "https://golivri.ecotrack.dz/" },
  mono_hub: { name: "Mono Hub", domain: "https://mono.ecotrack.dz/" },
  msm_go: { name: "MSM Go", domain: "https://msmgo.ecotrack.dz/" },
  negmar_express: { name: "Negmar Express", domain: "https://negmar.ecotrack.dz/" },
  packers: { name: "Packers", domain: "https://packers.ecotrack.dz/" },
  prest: { name: "Prest", domain: "https://prest.ecotrack.dz/" },
  rb_livraison: { name: "RB Livraison", domain: "https://rblivraison.ecotrack.dz/" },
  rex_livraison: { name: "Rex Livraison", domain: "https://rex.ecotrack.dz/" },
  rocket_delivery: { name: "Rocket Delivery", domain: "https://rocket.ecotrack.dz/" },
  salva_delivery: { name: "Salva Delivery", domain: "https://salvadelivery.ecotrack.dz/" },
  speed_delivery: { name: "Speed Delivery", domain: "https://speeddelivery.ecotrack.dz/" },
  tsl_express: { name: "TSL Express", domain: "https://tsl.ecotrack.dz/" },
  // CourierDZ's domain (worldexpress.ecotrack.dz) has no DNS record —
  // corrected to world-express.ecotrack.dz (hyphenated), verified via DNS + HTTP.
  world_express: { name: "WorldExpress", domain: "https://world-express.ecotrack.dz/" },
};

export class EcotrackAdapter implements CarrierAdapter {
  readonly carrier: string;
  private domain: string;

  constructor(tenantId: string, private credentials: { token: string }) {
    const tenant = ECOTRACK_TENANTS[tenantId];
    if (!tenant) throw new Error(`[Ecotrack] Unknown tenant "${tenantId}"`);
    this.carrier = tenantId;
    this.domain = tenant.domain;
  }

  private buildHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.credentials.token}`, "Content-Type": "application/json" };
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const url = `${this.domain}api/v1/create/order`;
    const headers = this.buildHeaders();
    const body = {
      reference: params.orderNumber,
      nom_client: `${params.customerFirstName} ${params.customerLastName}`.trim(),
      telephone: normalizeAlgerianPhone(params.customerPhone),
      telephone_2: params.customerPhone2 ? normalizeAlgerianPhone(params.customerPhone2) : "",
      adresse: params.address,
      commune: params.toCommune,
      code_wilaya: getWilayaCode(params.toWilaya),
      montant: params.price,
      remarque: params.note || "",
      produit: params.productList,
      stock: 0,
      type: params.hasExchange ? 2 : 1, // 1 = Livraison, 2 = Echange (NOT home/stopdesk — that's stop_desk below)
      stop_desk: params.isStopdesk ? 1 : 0,
    };

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ecotrack (${this.carrier}) API error ${res.status}: ${errorText}`);
    }
    const data = await res.json() as any;
    if (data.success === false) {
      throw new Error(`Ecotrack (${this.carrier}) createShipment failed: ${data.message || JSON.stringify(data)}`);
    }
    // Exact response field name is unconfirmed (no live response seen yet) —
    // check the common candidates rather than assuming one.
    const trackingNumber = data.tracking ?? data.numero_suivi ?? data.id ?? data.order_id ?? data.numero ?? null;
    if (!trackingNumber) {
      throw new Error(`Ecotrack (${this.carrier}) createShipment succeeded but no tracking number field was recognized in the response: ${JSON.stringify(data)}`);
    }
    return { trackingNumber: String(trackingNumber), status: "label_created", raw: data };
  }

  async getStatus(trackingNumber: string): Promise<ShipmentStatusResult> {
    // The reference implementation has no track/status API endpoint for
    // Ecotrack at all (throws "not implemented" there too). Rather than block
    // tracking entirely, hand back Ecotrack's public web tracking page —
    // merchants can check status manually until the real API endpoint is
    // found and verified.
    return {
      status: "manual_tracking_required",
      raw: { trackingUrl: `https://ecotrack.dz/tracking/${trackingNumber}` },
    };
  }

  async cancelShipment(_trackingNumber: string): Promise<CancelShipmentResult> {
    throw new Error(`[Ecotrack:${this.carrier}] No verified cancel endpoint exists for the Ecotrack API yet.`);
  }
}
