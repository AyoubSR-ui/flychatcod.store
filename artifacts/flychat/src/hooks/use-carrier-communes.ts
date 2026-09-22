import { useQuery } from "@tanstack/react-query";

// GET /api/carriers/communes — per-store union of every connected carrier's
// cached commune list (see artifacts/api-server/src/routes/carriers.ts),
// each tagged with hasStopDesk. Falls back to source: "static" (the same
// dataset GET /geo/wilayas serves, wrapped in this shape) when no connection
// has synced commune data yet — see the backend route for the exact rule.
const API_BASE = import.meta.env.VITE_API_URL || "https://zealous-nature-production-771f.up.railway.app";
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("flychat_token") || ""}` });

export interface CarrierCommune {
  name: string;
  hasStopDesk: boolean;
  carriers: string[];
}

export interface CarrierCommunesWilaya {
  code: number;
  name: string;
  communes: CarrierCommune[];
}

export interface CarrierCommunesResponse {
  source: "carriers" | "static";
  wilayas: CarrierCommunesWilaya[];
}

// ─── Geo-key normalization (browser-safe duplicate) ────────────────────────────
// Mirrors @workspace/db's normalizeGeoKey exactly (lib/db/src/geo-normalize.ts,
// used by the backend's dispatch-time commune matching) — that package is
// server-only and not a flychat dependency, so this is duplicated rather than
// imported. Keep both in sync if the algorithm ever changes. Arabic-stripped,
// accent-folded, lowercased, hyphens/whitespace collapsed — two names
// producing the same key are the same place for matching purposes; never use
// this for display, only for comparison.
const ARABIC_RANGE = /[؀-ۿݐ-ݿ]/g;
function stripArabic(value: string): string {
  return value.replace(ARABIC_RANGE, "").replace(/\s+/g, " ").trim();
}
function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
export function normalizeGeoKey(value: string): string {
  return stripAccents(stripArabic(value)).toLowerCase().replace(/[-\s]+/g, "");
}

// Same semantics as the backend's isValidCommuneForWilaya (normalized match,
// never exact-string) — a commune spelled slightly differently than the
// carrier's own list (accents, hyphens, case — e.g. "Sidi Bel-Abbes" vs the
// carrier's "Sidi Bel Abbes") still counts as valid, exactly like dispatch
// already treats it. Use this for any "is this commune OK" check; exact
// string comparison against carrier data will produce false warnings for
// communes dispatch actually accepts.
export function communeMatchesList(communes: CarrierCommune[], communeName: string): boolean {
  if (!communeName) return false;
  const target = normalizeGeoKey(communeName);
  return communes.some(c => normalizeGeoKey(c.name) === target);
}

export function useCarrierCommunes() {
  return useQuery({
    queryKey: ["carrier-communes"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/carriers/communes`, { headers: authHeaders() });
      return res.json() as Promise<CarrierCommunesResponse>;
    },
    // Communes/stop-desk availability don't change minute to minute — the
    // backend itself only refreshes daily (carrier-geo-cache.ts) — no need
    // to refetch this aggressively across three different pages.
    staleTime: 5 * 60 * 1000,
  });
}

export function getCommunesForWilaya(data: CarrierCommunesResponse | undefined, wilayaName: string): CarrierCommune[] {
  if (!wilayaName) return [];
  const wilaya = data?.wilayas.find(w => w.name.toLowerCase() === wilayaName.toLowerCase());
  return wilaya?.communes || [];
}

// Home: every commune, "(Stop Desk)" suffix appended to the display label
// for stop-desk-capable ones — the stored value is always the plain name.
// Stopdesk: only stop-desk-capable communes.
// Static source: neither filter nor suffix apply — hasStopDesk is always
// false in the static fallback (the static dataset has no such data at
// all), so filtering on it would show an empty Stop Desk list instead of
// preserving today's unfiltered behavior.
export function getCommuneDropdownOptions(
  communes: CarrierCommune[],
  deliveryType: "home" | "stopdesk",
  isStatic: boolean,
  stopDeskSuffix: string
): { value: string; label: string }[] {
  const filtered = !isStatic && deliveryType === "stopdesk" ? communes.filter(c => c.hasStopDesk) : communes;
  return filtered.map(c => ({
    value: c.name,
    label: !isStatic && deliveryType === "home" && c.hasStopDesk ? `${c.name} ${stopDeskSuffix}` : c.name,
  }));
}

export function communeHasStopDesk(communes: CarrierCommune[], communeName: string): boolean {
  const target = normalizeGeoKey(communeName);
  return !!communes.find(c => normalizeGeoKey(c.name) === target)?.hasStopDesk;
}
