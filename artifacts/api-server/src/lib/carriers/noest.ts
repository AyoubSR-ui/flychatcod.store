import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult } from "./types.js";

// ─── Noest Express adapter (Ecotrack platform) ─────────────────────────────────
// Noest runs on the Ecotrack white-label platform — the same underlying system
// used by other Algerian couriers (e.g. Anderson Ecotrack). Auth is CONFIRMED:
// a merchant GUID + API token, both generated from the Noest merchant dashboard.
//
// The parcel-creation request/response field names below are UNCONFIRMED —
// unlike Yalidine, no verified field shape was provided for Noest/Ecotrack.
// They're modeled on the same conceptual fields as Yalidine (Ecotrack is
// reportedly similar in shape per https://github.com/PiteurStudio/CourierDZ and
// https://github.com/DZBuild-com/dzship) but MUST be verified against real
// Ecotrack API docs or a live response before this adapter is trusted.
//
// Live HTTP calls are intentionally stubbed — do not enable until (a) real
// GUID/token credentials exist and (b) the field shape below is verified.

const NOEST_BASE_URL = "https://app.noest-dz.com/api/public"; // UNCONFIRMED — verify real Ecotrack API host for Noest

export class NoestAdapter implements CarrierAdapter {
  readonly carrier = "noest";

  constructor(private credentials: { guid: string; apiToken: string }) {}

  private buildAuthBody(): { api_token: string; user_guid: string } {
    // UNCONFIRMED: Ecotrack-family APIs commonly authenticate via body fields
    // rather than headers — needs verification against real Noest API docs.
    return { api_token: this.credentials.apiToken, user_guid: this.credentials.guid };
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const url = `${NOEST_BASE_URL}/create/order`; // UNCONFIRMED endpoint path
    const body = {
      ...this.buildAuthBody(),
      reference: params.orderNumber,
      client: `${params.customerFirstName} ${params.customerLastName}`.trim(),
      phone: params.customerPhone,
      adresse: params.address,
      wilaya_id: params.toWilaya, // UNCONFIRMED — Ecotrack commonly expects a numeric wilaya id, not name
      commune: params.toCommune,
      montant: params.price,
      produit: params.productList,
      remarque: "",
      is_stopdesk: params.isStopdesk ? 1 : 0,
      stopdesk_id: null,
      poids: params.weight ?? 1,
      allow_open: 0,
      is_exchange: params.hasExchange ? 1 : 0,
    };

    // TODO: uncomment once (1) real GUID/token credentials are connected and
    // (2) the field shape above is verified against real Ecotrack docs.
    //
    // const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // if (!res.ok) throw new Error(`Noest createShipment failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as Record<string, any>;
    // return {
    //   trackingNumber: data.tracking ?? data.order_id,
    //   status: "label_created",
    //   labelUrl: data.label_url ?? undefined,
    //   raw: data,
    // };

    throw new Error(
      `[Noest] Live API calls are stubbed pending real credentials and field-shape verification. ` +
      `Would POST ${url} with body ${JSON.stringify(body)}`
    );
  }

  async getStatus(trackingNumber: string): Promise<ShipmentStatusResult> {
    const url = `${NOEST_BASE_URL}/get/order/status`; // UNCONFIRMED endpoint path
    const body = { ...this.buildAuthBody(), tracking: trackingNumber };

    // TODO: uncomment once credentials + field shape are verified.
    // const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // if (!res.ok) throw new Error(`Noest getStatus failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as Record<string, any>;
    // return { status: data.status ?? "unknown", raw: data };

    throw new Error(`[Noest] Live API calls are stubbed pending real credentials and field-shape verification. Would POST ${url} with body ${JSON.stringify(body)}`);
  }

  async cancelShipment(trackingNumber: string): Promise<CancelShipmentResult> {
    const url = `${NOEST_BASE_URL}/cancel/order`; // UNCONFIRMED endpoint path
    const body = { ...this.buildAuthBody(), tracking: trackingNumber };

    // TODO: uncomment once credentials + field shape are verified.
    // const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // if (!res.ok) throw new Error(`Noest cancelShipment failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as Record<string, any>;
    // return { success: true, raw: data };

    throw new Error(`[Noest] Live API calls are stubbed pending real credentials and field-shape verification. Would POST ${url} with body ${JSON.stringify(body)}`);
  }
}
