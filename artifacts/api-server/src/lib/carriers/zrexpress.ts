import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult } from "./types.js";
import { getWilayaCode, resolveCommuneName } from "./wilaya-codes.js";
import { normalizeAlgerianPhone } from "./phone-format.js";

// ─── ZR Express (Procolis) adapter ─────────────────────────────────────────────
// Real field shape verified from the open-source PiteurStudio/CourierDZ client
// (ProcolisProviderIntegration.php) — not guessed, not from dzship's gateway
// docs (which deliberately withhold the real per-courier shape).
//
// Base URL: https://procolis.com/api_v1
// Auth: `token` + `key` headers (both from the ZR Express dashboard → Développement)
// Create: POST /add_colis, body { Colis: [ {...} ] }
//   Success check: response.Colis[0].MessageRetour === "Good"
//   ("Double Tracking" means a duplicate order_id/Tracking was reused)
// Track: POST /lire, body { Colis: [ { Tracking } ] }
// No cancel or label endpoint — ZR doesn't expose either via API.
//
// Live HTTP calls are intentionally stubbed pending real credentials.

const ZR_BASE_URL = "https://procolis.com/api_v1";

export class ZRExpressAdapter implements CarrierAdapter {
  readonly carrier = "zr_express";

  constructor(private credentials: { token: string; key: string }) {}

  private buildHeaders(): Record<string, string> {
    return {
      token: this.credentials.token,
      key: this.credentials.key,
      "Content-Type": "application/json",
    };
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const url = `${ZR_BASE_URL}/add_colis`;
    const headers = this.buildHeaders();
    const body = {
      Colis: [
        {
          Tracking: params.orderNumber,
          TypeLivraison: params.isStopdesk ? "1" : "0",
          TypeColis: params.hasExchange ? "1" : "0",
          Confrimee: "1",
          Client: `${params.customerFirstName} ${params.customerLastName}`.trim(),
          MobileA: normalizeAlgerianPhone(params.customerPhone),
          MobileB: params.customerPhone2 ? normalizeAlgerianPhone(params.customerPhone2) : "",
          Adresse: params.address,
          IDWilaya: String(getWilayaCode(params.toWilaya)),
          Commune: resolveCommuneName(params.toCommune, getWilayaCode(params.toWilaya)),
          Total: String(params.price),
          Note: params.note || "",
          TProduit: params.productList,
          id_Externe: params.orderId,
          Source: "FlyChat COD",
        },
      ],
    };

    // TODO: uncomment once a store has real ZR Express token/key credentials connected.
    // const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    // const data = await res.json() as any;
    // const colis = data.Colis?.[0];
    // if (colis?.MessageRetour === "Double Tracking") throw new Error(`ZR Express: duplicate tracking for order ${params.orderId}`);
    // if (colis?.MessageRetour !== "Good") throw new Error(`ZR Express createShipment failed: ${colis?.MessageRetour}`);
    // return { trackingNumber: colis.Tracking, status: "label_created", raw: colis };

    throw new Error(
      `[ZRExpress] Live API calls are stubbed pending real credentials. ` +
      `Would POST ${url} with headers ${JSON.stringify(Object.keys(headers))} and body ${JSON.stringify(body)}`
    );
  }

  async getStatus(trackingNumber: string): Promise<ShipmentStatusResult> {
    const url = `${ZR_BASE_URL}/lire`;
    const headers = this.buildHeaders();
    const body = { Colis: [{ Tracking: trackingNumber }] };

    // TODO: uncomment once real credentials are configured. The reference
    // implementation returns the raw Colis[0] object but doesn't document its
    // status field name — inspect a real response and confirm before reading
    // a specific field here.
    // const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    // const data = await res.json() as any;
    // const colis = data?.Colis?.[0];
    // return { status: colis?.Situation ?? "unknown", raw: colis }; // "Situation" field name UNCONFIRMED

    throw new Error(`[ZRExpress] Live API calls are stubbed pending real credentials. Would POST ${url} with body ${JSON.stringify(body)}`);
  }

  async cancelShipment(_trackingNumber: string): Promise<CancelShipmentResult> {
    throw new Error("[ZRExpress] Cancel is not supported by the ZR Express / Procolis API — cancel from their dashboard instead.");
  }
}
