// Arabic commune names — sourced directly from the same upstream dataset as
// algeria-communes.json (DZBuild-com/dzship/main/data/communes.json), not
// hand-transcribed. Verified 1:1 against algeria-communes.json: same 1541
// communes, same wilayaCode+name pairs, every entry has a nameAr.
//
// Kept as a separate file/module rather than adding nameAr onto each entry
// in algeria-communes.json, so the shape of ALGERIA_WILAYAS[].communes
// (string[]) doesn't change for existing consumers — the frontend commune
// dropdowns, GET /api/geo/wilayas, the backfill script's normalizeGeoKey
// matching all assume a plain string array.
//
// Built into Record<Arabic name, Latin name[]> rather than a 1:1 map
// because some Arabic commune names are shared by communes in different
// wilayas, sometimes even under different Latin spellings ("بوقرة" is
// "Bougara" in both Blida and Alger; "العامرية" is "El Amiria" in Oum El
// Bouaghi but "El Amria" in Aïn Témouchent) — findWilayasByCommune resolves
// each candidate Latin name separately and merges the wilaya matches, so
// this doesn't need to pick one spelling itself; a genuinely ambiguous case
// (multiple wilayas) still comes out ambiguous, same as the Latin side.
import data from "./algeria-communes-ar.json";

interface CommuneAr {
  wilayaCode: number;
  name: string;
  nameAr: string;
}

const COMMUNES_AR = data as CommuneAr[];

export const COMMUNE_ALIASES: Record<string, string[]> = {};
for (const c of COMMUNES_AR) {
  const key = c.nameAr.trim();
  const list = (COMMUNE_ALIASES[key] ??= []);
  if (!list.includes(c.name)) list.push(c.name);
}
