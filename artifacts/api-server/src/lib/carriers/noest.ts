import type { CarrierAdapter, CreateShipmentParams, ShipmentResult, ShipmentStatusResult, CancelShipmentResult } from "./types.js";

// ─── Noest Express adapter (blocked pending credential verification) ──────────
// You told me earlier this session: "Noest runs on Ecotrack, auth = a
// merchant GUID + API token." The REAL, verified Ecotrack request shape (from
// PiteurStudio/CourierDZ's open-source client, cross-checked against 22 real
// Ecotrack tenants — see ecotrack.ts) contradicts that: every verified tenant
// authenticates with a single `Authorization: Bearer {token}` header, no GUID
// at all. Noest isn't itself among those verified tenants, so I can't tell
// whether (a) the GUID+token description was for a different/older Noest API,
// or (b) Noest is standard Ecotrack and the GUID isn't actually required.
//
// Per instruction: rather than guess and risk silently misrouting a real
// parcel, this stays fully blocked with a clean merchant-facing message until
// that's confirmed against a real credential/response.

export class NoestAdapter implements CarrierAdapter {
  readonly carrier = "noest";

  constructor(private credentials: { guid?: string; token: string }) {}

  private blocked(): never {
    throw new Error("NOEST integration pending credential verification. Contact support to enable NOEST shipping.");
  }

  async createShipment(_params: CreateShipmentParams): Promise<ShipmentResult> {
    this.blocked();
  }

  async getStatus(_trackingNumber: string): Promise<ShipmentStatusResult> {
    this.blocked();
  }

  async cancelShipment(_trackingNumber: string): Promise<CancelShipmentResult> {
    this.blocked();
  }
}
