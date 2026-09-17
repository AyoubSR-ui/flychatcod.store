import { ALGERIA_WILAYAS } from "./algeria-communes-data.js";
import { normalizeGeoKey, stripArabic, resolveWilayaName } from "@workspace/db";

const WILAYA_NAMES = ALGERIA_WILAYAS.map(w => w.name);

// Wilaya name -> code, built from the canonical dataset. Used to be a
// hand-maintained WILAYA_CODES dict listing both the accented and
// unaccented spelling of every wilaya with diacritics as separate keys
// ("Béjaïa"/"Bejaia", "Sidi Bel Abbès"/"Sidi Bel Abbes", ...) — a third
// duplicate of the same 58 names. resolveWilayaName + normalizeGeoKey fold
// accents (and resolve Arabic/Darija-slang via WILAYA_ALIASES), so those
// spellings collapse automatically now; verified against the old dict
// before removing it — every one of its 74 entries (58 canonical + 16
// unaccented duplicates) resolved to the same code this produces.
const WILAYA_CODE_BY_NAME = new Map<string, number>();
for (const w of ALGERIA_WILAYAS) {
  WILAYA_CODE_BY_NAME.set(w.name, w.code);
}

// Real orders regularly have messy wilaya values — commune names instead of
// the wilaya, or bilingual strings like "BIR TOUTA بئر توتة" (an AI-captured
// address, or a customer typing both scripts for clarity). Reverse index:
// normalized commune name -> parent wilaya code, built from the verified
// 1541-commune dataset.
const WILAYA_CODE_BY_COMMUNE_KEY = new Map<string, number>();
for (const w of ALGERIA_WILAYAS) {
  for (const commune of w.communes) {
    WILAYA_CODE_BY_COMMUNE_KEY.set(normalizeGeoKey(commune), w.code);
  }
}

// Couriers like Ecotrack validate the commune against their own official
// list and reject anything that doesn't match exactly — "El Oued" or
// "EL OUED الوادي" both get rejected as "commune mal écrite" when their
// records expect "El-Oued". Normalize (Arabic-stripped, accent-folded,
// case/hyphen/space-insensitive) then return the dataset's exact official
// spelling for that wilaya. Falls back to the Arabic-stripped raw value
// (never blocks dispatch) if no match is found — a courier may still accept
// a slightly different spelling than our dataset.
export function resolveCommuneName(raw: string, wilayaCode: number): string {
  const cleaned = stripArabic(raw);
  const wilaya = ALGERIA_WILAYAS.find(w => w.code === wilayaCode);
  if (!wilaya) return cleaned || raw;
  const target = normalizeGeoKey(cleaned);
  const match = wilaya.communes.find(c => normalizeGeoKey(c) === target);
  return match || cleaned || raw;
}

// Unlike resolveCommuneName above (which never blocks — it's a best-effort
// spelling fix for whatever ends up going to the courier), this is the
// dispatch-time gate: an order with no commune, or one that doesn't belong
// to its wilaya at all, should never reach the courier and get rejected as
// "commune mal écrite" — it should be blocked here with a message that
// actually says what's wrong, before we spend an API call finding out.
export function isValidCommuneForWilaya(commune: string | null | undefined, wilayaCode: number): boolean {
  if (!commune) return false;
  const wilaya = ALGERIA_WILAYAS.find(w => w.code === wilayaCode);
  if (!wilaya) return false;
  const target = normalizeGeoKey(commune);
  return wilaya.communes.some(c => normalizeGeoKey(c) === target);
}

// Throws when a name can't be resolved as either a wilaya or a commune —
// silently defaulting to Alger (16) would misroute a real parcel with no
// indication anything went wrong. Better to fail the dispatch loudly.
export function getWilayaCode(wilayaName: string): number {
  const resolved = resolveWilayaName(wilayaName, WILAYA_NAMES);
  if (resolved) return WILAYA_CODE_BY_NAME.get(resolved)!;
  const byCommune = WILAYA_CODE_BY_COMMUNE_KEY.get(normalizeGeoKey(wilayaName));
  if (byCommune !== undefined) return byCommune;
  throw new Error(`Unknown wilaya "${wilayaName}" — doesn't match a wilaya or commune name. Check the order's wilaya field.`);
}

// Best-effort cleanup for storing a wilaya value coming from an external,
// uncontrolled source (Shopify's shipping_address.city, or whatever the AI
// agent extracted from a chat message) — resolves to the canonical dataset
// name when possible, otherwise falls back to an Arabic-stripped, trimmed
// version of the raw text rather than storing it completely unprocessed.
// Never throws — callers needing a hard failure on an unresolvable wilaya
// should use getWilayaCode instead (dispatch time).
export function normalizeWilayaForStorage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return resolveWilayaName(trimmed, WILAYA_NAMES) ?? (stripArabic(trimmed) || trimmed);
}
