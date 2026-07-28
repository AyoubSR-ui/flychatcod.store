import type { CarrierAdapter, CarrierMeta } from "./types.js";
import { YalidineAdapter } from "./yalidine.js";
import { NoestAdapter } from "./noest.js";

// ─── Carrier registry ──────────────────────────────────────────────────────────
// Single source of truth for which carriers the Connect UI offers and what
// credential fields each one needs. Adding a new carrier once its API is
// verified: write an adapter class + add one entry here — nothing else changes.

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
    id: "noest",
    name: "Noest Express",
    implemented: true,
    credentialFields: [
      { key: "guid", label: "Merchant GUID", placeholder: "TODO_NOEST_GUID" },
      { key: "apiToken", label: "API Token", placeholder: "TODO_NOEST_API_TOKEN", secret: true },
    ],
  },
  { id: "zr_express", name: "ZR Express", implemented: false, credentialFields: [] },
  { id: "anderson_ecotrack", name: "Anderson Ecotrack", implemented: false, credentialFields: [] },
  { id: "expedia_chrono", name: "Expedia Chrono", implemented: false, credentialFields: [] },
  { id: "ecom_delivery", name: "Ecom Delivery", implemented: false, credentialFields: [] },
  { id: "abex", name: "ABEX", implemented: false, credentialFields: [] },
  { id: "maystro", name: "Maystro", implemented: false, credentialFields: [] },
  { id: "aramex", name: "Aramex", implemented: false, credentialFields: [] },
];

export function getCarrierMeta(carrier: string): CarrierMeta | undefined {
  return CARRIER_REGISTRY.find((c) => c.id === carrier);
}

export function createCarrierAdapter(carrier: string, credentials: Record<string, string>): CarrierAdapter {
  switch (carrier) {
    case "yalidine":
      return new YalidineAdapter({ apiId: credentials.apiId, apiToken: credentials.apiToken });
    case "noest":
      return new NoestAdapter({ guid: credentials.guid, apiToken: credentials.apiToken });
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
