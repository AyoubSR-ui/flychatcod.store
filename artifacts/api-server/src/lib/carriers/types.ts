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

export interface CarrierAdapter {
  readonly carrier: string;
  createShipment(params: CreateShipmentParams): Promise<ShipmentResult>;
  getStatus(trackingNumber: string): Promise<ShipmentStatusResult>;
  cancelShipment(trackingNumber: string): Promise<CancelShipmentResult>;
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
}
