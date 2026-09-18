// ─── Carrier adapter contract ──────────────────────────────────────────────────
// Every delivery company (Yalidine, Noest, ZR Express, ...) implements this same
// interface. Adding a new carrier means adding one adapter class + one registry
// entry — nothing in orders/dispatch code needs to change.

export interface CreateShipmentParams {
  orderId: string;
  orderNumber: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  customerPhone2?: string;
  address: string;
  fromWilaya: string;
  toWilaya: string;
  toCommune: string;
  price: number;
  productList: string;
  isStopdesk: boolean;
  hasExchange: boolean;
  note?: string;
  declaredValue?: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
  freeshipping?: boolean;
}

export interface ShipmentResult {
  trackingNumber: string;
  status: string;
  labelUrl?: string;
  raw: Record<string, unknown>;
}

export interface ShipmentStatusResult {
  status: string;
  raw: Record<string, unknown>;
}

export interface CancelShipmentResult {
  success: boolean;
  raw: Record<string, unknown>;
}

// ─── Optional geo capability ────────────────────────────────────────────────────
// Communes (with stop-desk availability), desk locations, and per-wilaya fees,
// straight from the carrier's own API. Optional because most adapters don't
// expose this yet — only Ecotrack does, verified live (see ecotrack.ts).
// Callers must feature-detect (`if (adapter.getGeoData)`) rather than assume
// every adapter has it; the other adapters simply omit the method.

export interface CarrierCommune {
  name: string;
  wilayaCode: number;
  postalCode?: string;
  hasStopDesk: boolean;
}

export interface CarrierDesk {
  name: string;
  wilaya?: string;
  commune?: string;
  address?: string;
  phone?: string;
  mapLink?: string;
  // true for the merchant's own desk (Ecotrack's `my_desk`), false for a
  // network desk (`other_desks`) — origin vs. destination-side desks aren't
  // interchangeable for stop-desk delivery.
  isOwn: boolean;
  // Per-desk field names beyond the above are unconfirmed (see ecotrack.ts) —
  // the original response object, kept so nothing is lost to a wrong guess.
  raw: Record<string, unknown>;
}

export interface CarrierFee {
  wilayaCode: number;
  tarif: number;
  tarifStopdesk?: number;
}

export interface CarrierGeoData {
  communes: CarrierCommune[];
  desks: CarrierDesk[];
  fees: CarrierFee[];
}

export interface CarrierAdapter {
  readonly carrier: string;
  createShipment(params: CreateShipmentParams): Promise<ShipmentResult>;
  getStatus(trackingNumber: string): Promise<ShipmentStatusResult>;
  cancelShipment(trackingNumber: string): Promise<CancelShipmentResult>;
  getGeoData?(): Promise<CarrierGeoData>;
}

// Credential field describing what the generic Connect form should render for
// a given carrier (label + input type). Values live in carrier_connections.credentials.
export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

export interface CarrierMeta {
  id: string;
  name: string;
  implemented: boolean;
  credentialFields: CredentialField[];
  // Real logo URL, verified to actually resolve to an image (not guessed) —
  // omitted entirely for carriers without one rather than faking a path.
  logo?: string;
}
