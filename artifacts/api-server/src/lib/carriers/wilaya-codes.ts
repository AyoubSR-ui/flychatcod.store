import { ALGERIA_WILAYAS } from "./algeria-communes-data.js";

// Official 58-wilaya numeric codes. Several couriers (Maystro, Ecotrack family,
// ZR Express) require the numeric code, not the wilaya name.
const WILAYA_CODES: Record<string, number> = {
  "Adrar": 1, "Chlef": 2, "Laghouat": 3, "Oum El Bouaghi": 4, "Batna": 5,
  "Béjaïa": 6, "Bejaia": 6, "Biskra": 7, "Béchar": 8, "Bechar": 8, "Blida": 9,
  "Bouira": 10, "Tamanrasset": 11, "Tébessa": 12, "Tebessa": 12, "Tlemcen": 13,
  "Tiaret": 14, "Tizi Ouzou": 15, "Alger": 16, "Djelfa": 17, "Jijel": 18,
  "Sétif": 19, "Setif": 19, "Saïda": 20, "Saida": 20, "Skikda": 21,
  "Sidi Bel Abbès": 22, "Sidi Bel Abbes": 22, "Annaba": 23, "Guelma": 24,
  "Constantine": 25, "Médéa": 26, "Medea": 26, "Mostaganem": 27, "M'Sila": 28,
  "Msila": 28, "Mascara": 29, "Ouargla": 30, "Oran": 31, "El Bayadh": 32,
  "Illizi": 33, "Bordj Bou Arréridj": 34, "Bordj Bou Arreridj": 34,
  "Boumerdès": 35, "Boumerdes": 35, "El Tarf": 36, "Tindouf": 37,
  "Tissemsilt": 38, "El Oued": 39, "Khenchela": 40, "Souk Ahras": 41,
  "Tipaza": 42, "Mila": 43, "Aïn Defla": 44, "Ain Defla": 44, "Naâma": 45,
  "Naama": 45, "Aïn Témouchent": 46, "Ain Temouchent": 46, "Ghardaïa": 47,
  "Ghardaia": 47, "Relizane": 48, "Timimoun": 49, "Bordj Badji Mokhtar": 50,
  "Ouled Djellal": 51, "Béni Abbès": 52, "Beni Abbes": 52, "In Salah": 53,
  "In Guezzam": 54, "Touggourt": 55, "Djanet": 56, "El M'Ghair": 57,
  "El Meniaa": 58, "El Méniaa": 58,
};

// Real orders regularly have messy wilaya values — commune names instead of
// the wilaya, or bilingual strings like "BIR TOUTA بئر توتة" (an AI-captured
// address). Reverse index: commune name (lowercased) -> parent wilaya code,
// built from the verified 1541-commune dataset.
const COMMUNE_TO_WILAYA: Record<string, number> = {};
for (const w of ALGERIA_WILAYAS) {
  for (const commune of w.communes) {
    COMMUNE_TO_WILAYA[commune.toLowerCase()] = w.code;
  }
}

// Strips Arabic script and extra whitespace, keeping only the Latin-script
// part of a value like "BIR TOUTA بئر توتة" -> "BIR TOUTA".
export function stripNonLatin(value: string): string {
  return value.replace(/[؀-ۿݐ-ݿ]/g, "").replace(/\s+/g, " ").trim();
}

// Couriers like Ecotrack validate the commune against their own official
// list and reject anything that doesn't match exactly — "El Oued" or
// "EL OUED الوادي" both get rejected as "commune mal écrite" when their
// records expect "El-Oued". Normalize by stripping Arabic script and
// ignoring case/hyphen/space differences, then return the dataset's exact
// official spelling for that wilaya. Falls back to the cleaned raw value
// (never blocks dispatch) if no match is found — a courier may still accept
// a slightly different spelling than our dataset.
const communeKey = (s: string) => s.toLowerCase().replace(/[-\s]+/g, "");

export function resolveCommuneName(raw: string, wilayaCode: number): string {
  const cleaned = stripNonLatin(raw);
  const wilaya = ALGERIA_WILAYAS.find(w => w.code === wilayaCode);
  if (!wilaya) return cleaned || raw;
  const target = communeKey(cleaned);
  const match = wilaya.communes.find(c => communeKey(c) === target);
  return match || cleaned || raw;
}

// Throws when a name can't be resolved as either a wilaya or a commune —
// silently defaulting to Alger (16) would misroute a real parcel with no
// indication anything went wrong. Better to fail the dispatch loudly.
export function getWilayaCode(wilayaName: string): number {
  if (WILAYA_CODES[wilayaName]) return WILAYA_CODES[wilayaName];

  const candidates = [wilayaName, stripNonLatin(wilayaName)]
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

  for (const candidate of candidates) {
    for (const [name, code] of Object.entries(WILAYA_CODES)) {
      if (name.toLowerCase() === candidate) return code;
    }
    if (COMMUNE_TO_WILAYA[candidate]) return COMMUNE_TO_WILAYA[candidate];
  }

  throw new Error(`Unknown wilaya "${wilayaName}" — doesn't match a wilaya or commune name. Check the order's wilaya field.`);
}
