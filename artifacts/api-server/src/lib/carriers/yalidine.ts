import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult } from "./types.js";

// ─── Yalidine adapter ──────────────────────────────────────────────────────────
// Official API base: https://api.yalidine.app/v1/
// Auth: X-API-ID + X-API-TOKEN headers (generated from the merchant's Yalidine
// dashboard, under "Développement").
// Parcel-creation field shape below matches the real Yalidine API as documented
// by the community SDK at https://github.com/feeefapp/yalidine (POST /parcels/
// takes an array of parcel objects; the response is keyed by order_id and
// includes a "tracking" field for the generated tracking number).
//
// Live HTTP calls are intentionally stubbed — do not enable until real
// X-API-ID / X-API-TOKEN credentials are configured for a connected store.

const YALIDINE_BASE_URL = "https://api.yalidine.app/v1";

export class YalidineAdapter implements CarrierAdapter {
  readonly carrier = "yalidine";

  constructor(private credentials: { apiId: string; apiToken: string }) {}

  private buildHeaders(): Record<string, string> {
    return {
      "X-API-ID": this.credentials.apiId,
      "X-API-TOKEN": this.credentials.apiToken,
      "Content-Type": "application/json",
    };
  }

  async createShipment(params: CreateShipmentParams): Promise<ShipmentResult> {
    const url = `${YALIDINE_BASE_URL}/parcels/`;
    const headers = this.buildHeaders();
    const body = [
      {
        order_id: params.orderId,
        from_wilaya_name: params.fromWilaya,
        firstname: params.customerFirstName,
        familyname: params.customerLastName,
        contact_phone: params.customerPhone,
        address: params.address,
        to_commune_name: params.toCommune,
        to_wilaya_name: params.toWilaya,
        product_list: params.productList,
        price: params.price,
        do_insurance: false,
        declared_value: params.declaredValue ?? params.price,
        length: params.length ?? 0,
        width: params.width ?? 0,
        height: params.height ?? 0,
        weight: params.weight ?? 1,
        freeshipping: params.freeshipping ?? false,
        is_stopdesk: params.isStopdesk,
        has_exchange: params.hasExchange,
      },
    ];

    // TODO: uncomment once a store has real Yalidine X-API-ID / X-API-TOKEN
    // credentials connected. Left commented per instruction — do not attempt
    // live calls with placeholder credentials.
    //
    // const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    // if (!res.ok) throw new Error(`Yalidine createShipment failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as Record<string, any>;
    // const result = data[params.orderId];
    // return {
    //   trackingNumber: result.tracking,
    //   status: result.success ? "label_created" : "failed",
    //   labelUrl: result.label ?? undefined,
    //   raw: result,
    // };

    throw new Error(
      `[Yalidine] Live API calls are stubbed pending real credentials. ` +
      `Would POST ${url} with headers ${JSON.stringify(Object.keys(headers))} and body ${JSON.stringify(body)}`
    );
  }

  async getStatus(trackingNumber: string): Promise<ShipmentStatusResult> {
    const url = `${YALIDINE_BASE_URL}/parcels/?tracking=${encodeURIComponent(trackingNumber)}`;
    const headers = this.buildHeaders();

    // TODO: uncomment once real credentials are configured.
    // const res = await fetch(url, { headers });
    // if (!res.ok) throw new Error(`Yalidine getStatus failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as Record<string, any>;
    // const parcel = data.data?.[0];
    // return { status: parcel?.last_status ?? "unknown", raw: parcel };

    throw new Error(`[Yalidine] Live API calls are stubbed pending real credentials. Would GET ${url} with headers ${JSON.stringify(Object.keys(headers))}`);
  }

  async cancelShipment(trackingNumber: string): Promise<CancelShipmentResult> {
    // Yalidine parcels are cancelled/updated via PATCH /parcels/{tracking}
    // setting a cancellation status — exact field name to confirm against
    // real API response once credentials are available.
    const url = `${YALIDINE_BASE_URL}/parcels/${encodeURIComponent(trackingNumber)}`;
    const headers = this.buildHeaders();

    // TODO: uncomment once real credentials are configured.
    // const res = await fetch(url, { method: "DELETE", headers });
    // if (!res.ok) throw new Error(`Yalidine cancelShipment failed: ${res.status} ${await res.text()}`);
    // const data = await res.json() as Record<string, any>;
    // return { success: true, raw: data };

    throw new Error(`[Yalidine] Live API calls are stubbed pending real credentials. Would DELETE ${url} with headers ${JSON.stringify(Object.keys(headers))}`);
  }
}
