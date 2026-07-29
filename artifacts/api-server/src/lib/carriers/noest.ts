import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult } from "./types.js";
import { getWilayaCode } from "./wilaya-codes.js";

// ─── Noest Express adapter (Ecotrack platform) ─────────────────────────────────
// You told me earlier this session: "Noest runs on Ecotrack, auth = a
// merchant GUID + API token." I now have the REAL, verified Ecotrack request
// shape (from PiteurStudio/CourierDZ's open-source client, cross-checked
// against 22 real Ecotrack tenant implementations — see ecotrack.ts) — and it
// contradicts that: every verified Ecotrack tenant authenticates with a
// single `Authorization: Bearer {token}` header, no GUID at all.
//
// Noest itself isn't among CourierDZ's verified tenants, so I can't confirm
// which of these is right: (a) your GUID+token description was for a
// slightly different/older Noest API than the standard Ecotrack contract, or
// (b) Noest really is standard Ecotrack and the GUID isn't actually required.
// This adapter uses the VERIFIED Ecotrack shape (much stronger basis than a
// guess) but keeps the GUID field wired in case (a) is right — confirm
// against a real Noest response before enabling.
//
// Domain is UNCONFIRMED — Noest isn't in the verified tenant list, so this is
// inferred from the {tenant}.ecotrack.dz pattern shared by every other tenant,
// not independently verified the way the other 22 domains are.
//
// Live HTTP calls are intentionally stubbed pending real credentials.

const NOEST_BASE_URL = "https://noest.ecotrack.dz/"; // UNCONFIRMED — inferred from the shared tenant pattern, not independently verified

export class NoestAdapter implements CarrierAdapter {
  readonly carrier = "noest";

  constructor(private credentials: { guid?: string; token: string }) {}

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.credentials.token}`, "Content-Type": "application/json" };
    // Wired in case Noest's real API does need this — UNCONFIRMED whether Ecotrack even reads it.
    if (this.credentials.guid) headers["X-Merchant-GUID"] = this.credentials.guid;
    return headers;
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const url = `${NOEST_BASE_URL}api/v1/create/order`;
    const headers = this.buildHeaders();
    const body = {
      reference: params.orderNumber,
      nom_client: `${params.customerFirstName} ${params.customerLastName}`.trim(),
      telephone: params.customerPhone.replace(/\D/g, ""),
      telephone_2: params.customerPhone2?.replace(/\D/g, "") || "",
      adresse: params.address,
      commune: params.toCommune,
      code_wilaya: getWilayaCode(params.toWilaya),
      montant: params.price,
      remarque: params.note || "",
      produit: params.productList,
      stock: 0,
      type: params.hasExchange ? 2 : 1,
      stop_desk: params.isStopdesk ? 1 : 0,
    };

    // TODO: uncomment once (1) real Noest credentials are connected and
    // (2) the domain + GUID questions above are confirmed against a real response.
    // const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    // const data = await res.json() as any;
    // if (data.success === false) throw new Error(`Noest createShipment failed: ${data.message}`);
    // return { trackingNumber: data.tracking ?? data.id, status: "label_created", raw: data };

    throw new Error(
      `[Noest] Live API calls are stubbed pending real credentials and domain/auth verification. ` +
      `Would POST ${url} with headers ${JSON.stringify(Object.keys(headers))} and body ${JSON.stringify(body)}`
    );
  }

  async getStatus(_trackingNumber: string): Promise<ShipmentStatusResult> {
    throw new Error("[Noest] No verified status/tracking endpoint exists yet (Ecotrack's reference client doesn't implement one either).");
  }

  async cancelShipment(_trackingNumber: string): Promise<CancelShipmentResult> {
    throw new Error("[Noest] No verified cancel endpoint exists yet.");
  }
}
