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
  id?: string;
  name: string;
  wilaya?: string;
  commune?: string;
  address?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  mapLink?: string;
  workingHours?: unknown[];
  // true for the merchant's own desk (Ecotrack's `my_desk`), false for a
  // network desk (`other_desks`) — origin vs. destination-side desks aren't
  // interchangeable for stop-desk delivery.
  isOwn: boolean;
  // The original response object for this desk, kept alongside the typed
  // fields above in case a consumer needs something not modeled here.
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

// ─── Optional connection-verification capability ───────────────────────────────
// A single read-only probe run with the merchant's own credentials to confirm
// they actually authenticate — never a parcel creation or anything else that
// could mutate carrier-side state. Absent on adapters with no live probe yet
// (everything except Ecotrack, currently) — callers must feature-detect
// (`if (adapter.verifyConnection)`) rather than assume every adapter has it,
// same convention as getGeoData.
export type CarrierVerificationStatus = "verified" | "failed" | "unverified";

// Deliberately not a closed enum in the type system (kept as `string` at the
// DB layer too) — the known reasons below cover what's distinguishable today,
// but a new adapter's probe may surface a genuinely new failure category
// without needing a schema change.
export type CarrierVerificationFailureReason =
  | "invalid_credentials"
  | "rate_limited"
  | "timeout"
  | "carrier_outage"
  | "unknown_error";

export interface CarrierVerificationResult {
  status: CarrierVerificationStatus;
  // The exact path probed (no host, no query string with the token in it —
  // see the "never store the token" rule) so a merchant/support can see what
  // was actually called.
  probePath: string;
  httpStatus: number | null;
  // The carrier's own error/status code from the response body, if any
  // (e.g. Ecotrack's "INVALID_TOKEN" / "TOKEN_NOT_ALLOWED" / "VALID_TOKEN").
  carrierErrorCode: string | null;
  // Human-readable, and MUST NOT contain the token/credentials — every
  // adapter implementing this composes its own message text rather than
  // echoing raw response bodies verbatim, and carrier-verification.ts
  // applies a token-scrub as a second line of defense before persisting.
  message: string;
  failureReason?: CarrierVerificationFailureReason;
  latencyMs: number;
}

export interface CarrierAdapter {
  readonly carrier: string;
  createShipment(params: CreateShipmentParams): Promise<ShipmentResult>;
  getStatus(trackingNumber: string): Promise<ShipmentStatusResult>;
  cancelShipment(trackingNumber: string): Promise<CancelShipmentResult>;
  getGeoData?(): Promise<CarrierGeoData>;
  verifyConnection?(): Promise<CarrierVerificationResult>;
}

// Credential field describing what the generic Connect form should render for
// a given carrier (label + input type). Values live in carrier_connections.credentials.
export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  secret?: boolean;
}

// "live": the adapter's real HTTP calls are wired and verified against a
// real connected account — dispatch will actually attempt delivery.
// "not_available": everything else, regardless of whether the credential
// shape is known — createShipment throws today, so no merchant should be
// able to "successfully connect" it (see the carrier honesty audit: four
// carriers previously showed "Connected" while every dispatch would fail).
export type CarrierStatus = "live" | "not_available";

export interface CarrierMeta {
  id: string;
  name: string;
  status: CarrierStatus;
  credentialFields: CredentialField[];
  // Real logo URL, verified to actually resolve to an image (not guessed) —
  // omitted entirely for carriers without one rather than faking a path.
  logo?: string;
}
