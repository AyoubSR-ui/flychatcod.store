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
// status: "live" means real HTTP calls are wired AND verified against a real
// connected account — see carriers/types.ts. Only the Ecotrack tenants
// qualify (and precisely: anderson_ecotrack is verified end-to-end; the other
// 21 share the identical platform/adapter but haven't individually been
// probed with a real token yet — see the carrier honesty audit).
//
// Everything else is "not_available", regardless of how well the credential
// shape is sourced — createShipment throws for all four (Yalidine, ZR
// Express, Maystro, Noest) today. This used to be a single "implemented"
// flag that conflated "shape is known" with "actually works," which let a
// merchant successfully connect Yalidine/ZR/Maystro/Noest and only discover
// on first real dispatch that it silently never worked. Confirmed via a
// direct DB check (2026, carrier honesty audit) that no merchant had done
// so yet — this is prevention, not a fix for something already broken for
// someone.

// Every URL here was fetched and confirmed to return a real image (curl
// content-type check), sourced from CourierDZ's own metadata() per provider
// or (Yalidine) scraped directly from the live homepage's <img> tag — not
// guessed. Carriers with no verified logo are simply absent from this map;
// the UI falls back to an icon rather than a fabricated path.
const VERIFIED_LOGOS: Record<string, string> = {
  yalidine: "https://yalidine.com/assets/img/yalidine-logo.png",
  maystro: "https://maystro-delivery.com/img/Maystro-blue-extonly.svg",
  anderson_ecotrack: "https://cdn1.ecotrack.dz/anderson/images/login_logoctVbSeP.png",
  dhd: "https://dhd-dz.com/assets/img/logo.png",
  conexlog: "https://conexlog-dz.com/assets/img/logo.png",
  golivri: "https://cdn1.ecotrack.dz/golivri/images/login_logoP2208XU.png",
  ba_consult: "https://cdn1.ecotrack.dz/bacexpress/images/login_logoeORMVno.png",
  distazero: "https://cdn1.ecotrack.dz/distazero/images/login_logooI8OebS.png",
  rex_livraison: "https://cdn1.ecotrack.dz/rex/images/login_logoCu3Rwdm.png",
  rocket_delivery: "https://cdn1.ecotrack.dz/rocket/images/login_logogAux6nt.png",
  salva_delivery: "https://cdn1.ecotrack.dz/salvadelivery/images/login_logo6GOyzNz.png",
  tsl_express: "https://cdn1.ecotrack.dz/tsl/images/login_logoxDIzsCJ.png",
};

// Placeholder is a realistic JWT-shaped example — Ecotrack's own docs show
// tokens in this form (e.g. dzship's "eyJ0…" example) and this is the one
// credential shape actually verified live (anderson_ecotrack; see
// carriers/ecotrack.ts and the carrier honesty audit).
const ECOTRACK_TOKEN_PLACEHOLDER =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.4Adcj3UFYzPUVaVF43FmMab6RlaQD8A9V8wFzzht-KQ";

const ECOTRACK_ENTRIES: CarrierMeta[] = Object.entries(ECOTRACK_TENANTS).map(([id, tenant]) => ({
  id,
  name: tenant.name,
  status: "live",
  credentialFields: [{ key: "token", label: "API Token", placeholder: ECOTRACK_TOKEN_PLACEHOLDER, secret: true }],
  logo: VERIFIED_LOGOS[id],
}));

export const CARRIER_REGISTRY: CarrierMeta[] = [
  {
    id: "yalidine",
    name: "Yalidine",
    status: "not_available",
    credentialFields: [
      // apiId's numeric shape is documented publicly (Yalidine dashboard,
      // "Développement" tab) — this example is realistic. apiToken's exact
      // format is NOT independently verified (only the header name X-API-TOKEN
      // is confirmed) — the example below is a plausible-looking guess, not a
      // confirmed shape. Flagging here since the placeholder itself can't say so.
      { key: "apiId", label: "API ID", placeholder: "e.g. 51999" },
      { key: "apiToken", label: "API Token", placeholder: "e.g. a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6", secret: true },
    ],
    logo: VERIFIED_LOGOS.yalidine,
  },
  {
    id: "zr_express",
    name: "ZR Express",
    status: "not_available",
    credentialFields: [
      // Renamed from the old token/key pair (which targeted procolis.com,
      // ZR's legacy platform) to match what ZR's current dashboard
      // (api.zrexpress.app) actually calls these — see the carrier honesty
      // audit, corroborated independently against github.com/bighadj22/codflow's
      // live-verified (2026-09-10) ZR Express integration. Field keys/labels
      // are correct now so the Connect form is already right once the adapter
      // itself is rebuilt against api.zrexpress.app — see zrexpress.ts, still
      // targeting the old platform and NOT yet changed by this pass.
      // tenantId is confirmed UUID-shaped (CodFlow: "all IDs are UUIDs").
      // secretKey's exact format isn't independently confirmed beyond "an
      // opaque API key" — the example is a plausible guess, not verified.
      { key: "secretKey", label: "API Key", placeholder: "e.g. 7f2a91b3c8d64e0fa1b2c3d4e5f6a7b8", secret: true },
      { key: "tenantId", label: "Tenant ID", placeholder: "e.g. 3f9c2a10-4b7e-4c8d-9a1f-6e2d5b8c1a3f" },
    ],
    // No verified logo — zrexpress.com's asset path 403'd on check, and
    // CourierDZ's own metadata URL for it 403'd too. Not guessing another.
  },
  {
    id: "maystro",
    name: "Maystro Delivery",
    status: "not_available",
    credentialFields: [
      // Never connected to a real Maystro account — the credential shape
      // itself (single token, header `Authorization: Token {token}`) comes
      // from a reference client, not Maystro's own docs/dashboard. A
      // realistic-looking placeholder would overstate how much of this is
      // actually confirmed, so this stays plainly descriptive instead of a
      // fabricated example.
      { key: "token", label: "API Token", placeholder: "Your Maystro API token", secret: true },
    ],
    logo: VERIFIED_LOGOS.maystro,
  },
  {
    id: "noest",
    name: "Noest Express",
    status: "not_available",
    credentialFields: [
      // Same reasoning as Maystro, and worse: whether a GUID is even
      // required at all is unresolved (see noest.ts) — inventing a
      // plausible-looking GUID example would imply confidence that doesn't
      // exist. Left descriptive, not example-shaped.
      { key: "token", label: "API Token", placeholder: "Your Noest API token", secret: true },
      { key: "guid", label: "Merchant GUID (if required)", placeholder: "Your Noest merchant GUID, if you have one" },
    ],
    // No verified logo — the URL given for Noest resolved to an HTML page,
    // not an image.
  },
  ...ECOTRACK_ENTRIES,
  { id: "expedia_chrono", name: "Expedia Chrono", status: "not_available", credentialFields: [] },
  { id: "ecom_delivery", name: "Ecom Delivery", status: "not_available", credentialFields: [] },
  { id: "abex", name: "ABEX", status: "not_available", credentialFields: [] },
  { id: "aramex", name: "Aramex", status: "not_available", credentialFields: [] },
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
      // Unreachable while zr_express is "not_available" (the connect route
      // blocks it before this is ever called). credentials.token/.key are
      // stale field names left over from the pre-rename registry entry
      // above (now secretKey/tenantId) — this mapping (and ZRExpressAdapter
      // itself) needs rebuilding against api.zrexpress.app together, not
      // patched in isolation. See the carrier honesty audit.
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
