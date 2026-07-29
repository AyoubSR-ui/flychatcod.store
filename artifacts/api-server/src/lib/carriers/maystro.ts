import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult } from "./types.js";
import { getWilayaCode } from "./wilaya-codes.js";

// ─── Maystro Delivery adapter ──────────────────────────────────────────────────
// Real field shape verified from the open-source PiteurStudio/CourierDZ client
// (MaystroDeliveryProvider.php) — not guessed, not from dzship's gateway docs.
//
// Base URL: https://backend.maystro-delivery.com/api/
// Auth: `Authorization: Token {token}` header (single credential)
// Create: POST stores/orders/ — note `commune` is a Maystro-internal NUMERIC
//   commune ID, not a name or the standard wilaya commune code. There is no
//   verified source for that ID list in this codebase yet — this is a real
//   gap, not an oversight; do not enable until Maystro's commune list (or a
//   lookup endpoint) has been found and confirmed.
// Get: GET stores/orders/{orderId}/
// Label: POST delivery/starter/starter_bordureau/ (returns raw PDF bytes)
// No cancel endpoint in the reference implementation.
//
// Live HTTP calls are intentionally stubbed pending real credentials AND the
// commune-ID gap above.

const MAYSTRO_BASE_URL = "https://backend.maystro-delivery.com/api/";

export class MaystroAdapter implements CarrierAdapter {
  readonly carrier = "maystro";

  constructor(private credentials: { token: string }) {}

  private buildHeaders(): Record<string, string> {
    return { Authorization: `Token ${this.credentials.token}`, "Content-Type": "application/json" };
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const url = `${MAYSTRO_BASE_URL}stores/orders/`;
    const headers = this.buildHeaders();
    const body = {
      wilaya: getWilayaCode(params.toWilaya),
      // UNCONFIRMED: Maystro requires a Maystro-internal numeric commune ID
      // here, not a name. No verified source for that mapping exists yet —
      // this placeholder WILL be wrong until that's resolved.
      commune: 0,
      destination_text: params.toCommune,
      customer_phone: params.customerPhone.replace(/\D/g, ""),
      customer_name: `${params.customerFirstName} ${params.customerLastName}`.trim(),
      product_price: Math.round(params.price),
      delivery_type: params.isStopdesk ? 1 : 0,
      express: false,
      note_to_driver: params.note || "",
      products: [{ logistical_description: params.productList }],
      source: 4,
      external_order_id: params.orderId,
    };

    // TODO: uncomment once (1) real Maystro token is connected and (2) the
    // commune-ID gap above is resolved.
    // const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    // if (!res.ok) throw new Error(`Maystro createShipment failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as any;
    // return { trackingNumber: String(data.id ?? data.tracking), status: "label_created", raw: data };

    throw new Error(
      `[Maystro] Live API calls are stubbed pending real credentials and the commune-ID gap. ` +
      `Would POST ${url} with headers ${JSON.stringify(Object.keys(headers))} and body ${JSON.stringify(body)}`
    );
  }

  async getStatus(trackingNumber: string): Promise<ShipmentStatusResult> {
    const url = `${MAYSTRO_BASE_URL}stores/orders/${encodeURIComponent(trackingNumber)}/`;
    const headers = this.buildHeaders();

    // TODO: uncomment once real credentials are configured.
    // const res = await fetch(url, { headers });
    // if (!res.ok) throw new Error(`Maystro getStatus failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as any;
    // return { status: data.status ?? "unknown", raw: data }; // exact status field name UNCONFIRMED

    throw new Error(`[Maystro] Live API calls are stubbed pending real credentials. Would GET ${url} with headers ${JSON.stringify(Object.keys(headers))}`);
  }

  async cancelShipment(_trackingNumber: string): Promise<CancelShipmentResult> {
    throw new Error("[Maystro] No cancel endpoint found in the reference implementation — cancel from the Maystro dashboard instead.");
  }
}
