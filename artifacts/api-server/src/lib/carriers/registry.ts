import type { CarrierAdapter, CarrierMeta } from "./types.js";
import { YalidineAdapter } from "./yalidine.js";
import { NoestAdapter } from "./noest.js";
import { ZRExpressAdapter } from "./zrexpress.js";
import { MaystroAdapter } from "./maystro.js";
import { EcotrackAdapter, ECOTRACK_TENANTS } from "./ecotrack.js";

// ─── Carrier registry ──────────────────────────────────────────────────────────
// Single source of truth for which carriers the Connect UI offers and what
// credential fields each one needs. Adding a new carrier once its API is
// verified: write an adapter class + add one entry here — nothing else changes.
//
// "implemented: true" here means the request/response shape was independently
// verified from a real working implementation (the open-source
// PiteurStudio/CourierDZ client), not guessed. Live HTTP calls are still
// stubbed in every adapter pending real store credentials — see each file.

const ECOTRACK_ENTRIES: CarrierMeta[] = Object.entries(ECOTRACK_TENANTS).map(([id, tenant]) => ({
  id,
  name: tenant.name,
  implemented: true,
  credentialFields: [{ key: "token", label: "API Token", placeholder: "TODO_" + id.toUpperCase() + "_TOKEN", secret: true }],
}));

export const CARRIER_REGISTRY: CarrierMeta[] = [
  {
    id: "yalidine",
    name: "Yalidine",
    implemented: true,
    credentialFields: [
      { key: "apiId", label: "API ID", placeholder: "TODO_YALIDINE_API_ID" },
      { key: "apiToken", label: "API Token", placeholder: "TODO_YALIDINE_API_TOKEN", secret: true },
    ],
  },
  {
    id: "zr_express",
    name: "ZR Express",
    implemented: true,
    credentialFields: [
      { key: "token", label: "Token", placeholder: "TODO_ZR_TOKEN", secret: true },
      { key: "key", label: "Key", placeholder: "TODO_ZR_KEY", secret: true },
    ],
  },
  {
    id: "maystro",
    name: "Maystro Delivery",
    implemented: true,
    credentialFields: [
      { key: "token", label: "API Token", placeholder: "TODO_MAYSTRO_TOKEN", secret: true },
    ],
  },
  {
    id: "noest",
    name: "Noest Express",
    implemented: true,
    credentialFields: [
      { key: "token", label: "API Token", placeholder: "TODO_NOEST_TOKEN", secret: true },
      { key: "guid", label: "Merchant GUID (if required)", placeholder: "TODO_NOEST_GUID" },
    ],
  },
  ...ECOTRACK_ENTRIES,
  { id: "expedia_chrono", name: "Expedia Chrono", implemented: false, credentialFields: [] },
  { id: "ecom_delivery", name: "Ecom Delivery", implemented: false, credentialFields: [] },
  { id: "abex", name: "ABEX", implemented: false, credentialFields: [] },
  { id: "aramex", name: "Aramex", implemented: false, credentialFields: [] },
];

export function getCarrierMeta(carrier: string): CarrierMeta | undefined {
  return CARRIER_REGISTRY.find((c) => c.id === carrier);
}

export function createCarrierAdapter(carrier: string, credentials: Record<string, string>): CarrierAdapter {
  if (carrier in ECOTRACK_TENANTS) {
    return new EcotrackAdapter(carrier, { token: credentials.token });
  }
  switch (carrier) {
    case "yalidine":
      return new YalidineAdapter({ apiId: credentials.apiId, apiToken: credentials.apiToken });
    case "zr_express":
      return new ZRExpressAdapter({ token: credentials.token, key: credentials.key });
    case "maystro":
      return new MaystroAdapter({ token: credentials.token });
    case "noest":
      return new NoestAdapter({ token: credentials.token, guid: credentials.guid || undefined });
    default: {
      const meta = getCarrierMeta(carrier);
      throw new Error(
        meta
          ? `[Carriers] "${meta.name}" is not implemented yet — no adapter exists until its API is verified.`
          : `[Carriers] Unknown carrier "${carrier}".`
      );
    }
  }
}
