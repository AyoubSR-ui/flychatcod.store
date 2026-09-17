// Shared normalizer for Algerian wilaya/commune names — the one place this
// logic lives. Previously duplicated three ways: wilaya-codes.ts hand-listed
// both accented and unaccented spellings as separate dict keys (e.g.
// "Béjaïa"/"Bejaia"), ai-agent-bridge.ts had its own separate
// normalizeWilaya()/stripAccents()/WILAYA_ALIASES used only for a
// shipping-price lookup (never applied before writing orders.wilaya), and
// add-orders-commune.cjs matched wilaya case-insensitively but commune
// case-sensitively, with no accent or Arabic handling in either.
//
// Lives in @workspace/db (rather than inside api-server, where the real
// consumers — carriers/wilaya-codes.ts and ai-agent-bridge.ts — actually
// are) because it also needs to be reachable from scripts/ for the backfill
// script, and @workspace/db is the one workspace package both api-server
// and scripts already depend on.
//
// Real orders regularly have messy wilaya/commune values: Arabic script
// mixed with Latin ("SIDI BEL ABBES سيدي بلعباس" — an AI-captured chat
// message; customers commonly type both for clarity), pure Arabic script
// alone, Darija-Latin colloquial names ("wahran" for Oran — shares no
// letters with the French spelling, so no amount of accent/case folding
// bridges it), and inconsistent accents/case ("Abbès" vs "ABBES").

// Arabic script Unicode blocks (Arabic + Arabic Supplement).
const ARABIC_RANGE = /[؀-ۿݐ-ݿ]/g;

export function stripArabic(value: string): string {
  return value.replace(ARABIC_RANGE, "").replace(/\s+/g, " ").trim();
}

// "Béjaïa" -> "Bejaia", "Sétif" -> "Setif".
export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Canonical comparison key: Arabic-stripped, accent-folded, lowercased,
// hyphens/whitespace collapsed. Two names producing the same key are the
// same place for matching purposes — never use this for display, only the
// dataset's real spelling should ever be shown or sent to a courier. Note:
// a *purely* Arabic-script input normalizes to "" (nothing left after
// stripping) — that's intentional, it means "this key tells us nothing on
// its own," not "this matches everything empty." Pure-Arabic and Darija
// slang names go through WILAYA_ALIASES / resolveWilayaName instead.
export function normalizeGeoKey(value: string): string {
  return stripAccents(stripArabic(value)).toLowerCase().replace(/[-\s]+/g, "");
}

// Darija-Latin colloquial names and pure-Arabic-script wilaya names that
// don't reduce to a recognizable dataset spelling via normalizeGeoKey alone
// — a phonetic nickname shares no letters with the French name, and
// stripping Arabic from a *purely* Arabic string leaves nothing to compare.
// Keyed on trimmed-lowercased raw text — Arabic has no case, so
// .toLowerCase() is a no-op there and only affects the Latin entries.
export const WILAYA_ALIASES: Record<string, string> = {
  // ── Latin Darija → French ──────────────────────────────────────────────────
  "wahran": "Oran", "ouahran": "Oran",
  "dzayer": "Alger", "dzair": "Alger", "el djazair": "Alger",
  "qsantina": "Constantine", "ksantina": "Constantine", "casantina": "Constantine",
  "3annaba": "Annaba", "3naba": "Annaba",
  "setif": "Sétif", "stif": "Sétif",
  "tlemcen": "Tlemcen", "tilimsan": "Tlemcen",
  "batna": "Batna",
  "sidi bel abbes": "Sidi Bel Abbès", "sba": "Sidi Bel Abbès",
  "biskra": "Biskra",
  "blida": "Blida", "boufarik": "Blida",
  "bejaia": "Béjaïa", "bgayet": "Béjaïa", "bgayette": "Béjaïa",
  "tizi ouzou": "Tizi Ouzou", "tizi wezzu": "Tizi Ouzou",
  "msila": "M'Sila", "m'sila": "M'Sila",
  "mostaganem": "Mostaganem", "musteghanem": "Mostaganem",
  "chlef": "Chlef", "chelef": "Chlef",
  "tiaret": "Tiaret", "tihert": "Tiaret",
  "bechar": "Béchar", "bashar": "Béchar",
  "ouargla": "Ouargla", "wargla": "Ouargla", "wergla": "Ouargla",
  "ghardaia": "Ghardaïa", "ghardaya": "Ghardaïa",
  "laghouat": "Laghouat", "leghouat": "Laghouat",
  "djelfa": "Djelfa", "jalfa": "Djelfa",
  "medea": "Médéa", "medya": "Médéa",
  "bouira": "Bouira", "bwira": "Bouira",
  "boumerdes": "Boumerdès", "bumerdes": "Boumerdès",
  "tipaza": "Tipaza", "tipasa": "Tipaza",
  "ain defla": "Aïn Defla",
  "ain temouchent": "Aïn Témouchent",
  "relizane": "Relizane", "ghilizane": "Relizane",
  "mascara": "Mascara",
  "saida": "Saïda",
  "naama": "Naâma",
  "el bayadh": "El Bayadh",
  "adrar": "Adrar",
  "tamanrasset": "Tamanrasset", "tamenrasset": "Tamanrasset",
  "illizi": "Illizi",
  "tindouf": "Tindouf",
  "khenchela": "Khenchela",
  "souk ahras": "Souk Ahras",
  "tebessa": "Tébessa", "tbessa": "Tébessa",
  "oum el bouaghi": "Oum El Bouaghi",
  "bordj bou arreridj": "Bordj Bou Arréridj", "bba": "Bordj Bou Arréridj",
  "mila": "Mila",
  "jijel": "Jijel",
  "skikda": "Skikda",
  "guelma": "Guelma",
  "el tarf": "El Tarf",
  "el oued": "El Oued", "l oued": "El Oued",
  "ouled djellal": "Ouled Djellal",
  "touggourt": "Touggourt", "tougourt": "Touggourt",
  "in salah": "In Salah", "in guezzam": "In Guezzam",

  // ── Arabic → French ────────────────────────────────────────────────────────
  "الجزائر": "Alger", "الجزائر العاصمة": "Alger",
  "وهران": "Oran",
  "قسنطينة": "Constantine",
  "عنابة": "Annaba",
  "سطيف": "Sétif",
  "تلمسان": "Tlemcen",
  "باتنة": "Batna",
  "سيدي بلعباس": "Sidi Bel Abbès",
  "بسكرة": "Biskra",
  "البليدة": "Blida",
  "بجاية": "Béjaïa",
  "تيزي وزو": "Tizi Ouzou",
  "المسيلة": "M'Sila",
  "مستغانم": "Mostaganem",
  "الشلف": "Chlef",
  "تيارت": "Tiaret",
  "بشار": "Béchar",
  "ورقلة": "Ouargla",
  "غرداية": "Ghardaïa",
  "الأغواط": "Laghouat",
  "الجلفة": "Djelfa",
  "المدية": "Médéa",
  "البويرة": "Bouira",
  "بومرداس": "Boumerdès",
  "تيبازة": "Tipaza",
  "عين الدفلى": "Aïn Defla",
  "عين تموشنت": "Aïn Témouchent",
  "غليزان": "Relizane",
  "معسكر": "Mascara",
  "سعيدة": "Saïda",
  "النعامة": "Naâma",
  "البيض": "El Bayadh",
  "أدرار": "Adrar",
  "تمنراست": "Tamanrasset",
  "إليزي": "Illizi",
  "تندوف": "Tindouf",
  "خنشلة": "Khenchela",
  "سوق أهراس": "Souk Ahras",
  "تبسة": "Tébessa",
  "أم البواقي": "Oum El Bouaghi",
  "برج بوعريريج": "Bordj Bou Arréridj",
  "ميلة": "Mila",
  "جيجل": "Jijel",
  "سكيكدة": "Skikda",
  "قالمة": "Guelma",
  "الطارف": "El Tarf",
  "الوادي": "El Oued",
  "أولاد جلال": "Ouled Djellal",
  "تقرت": "Touggourt",
  "عين صالح": "In Salah",
  "عين قزام": "In Guezzam",
};

// Resolves any messy wilaya string — pure Latin (any case/accent), Arabic
// script, Darija-Latin slang, or Latin+Arabic mixed — to one of the
// supplied canonical names, or undefined if nothing matches. wilayaNames is
// the caller's own canonical list (e.g. ALGERIA_WILAYAS' names in
// api-server) — kept as a parameter so this module doesn't need to depend
// on where that dataset lives.
export function resolveWilayaName(raw: string, wilayaNames: string[]): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const key = normalizeGeoKey(trimmed);
  if (key) {
    const exact = wilayaNames.find(name => normalizeGeoKey(name) === key);
    if (exact) return exact;
  }
  return WILAYA_ALIASES[trimmed.toLowerCase()];
}

// Minimal shape needed to search communes — kept generic (not tied to the
// api-server Wilaya interface) so this module stays dataset-agnostic.
export interface WilayaCommuneList {
  communes: string[];
}

// Some AI-captured "wilaya" values are actually a commune name — the model
// extracted a real place, just not the right *level* of place ("Bir el Djir"
// is a commune of Oran, not a wilaya). Finds every wilaya (from the given
// list) with a commune matching raw after normalization. Zero matches means
// raw isn't a recognizable place at all; exactly one is an unambiguous
// inference (that wilaya, that exact commune spelling); more than one means
// the commune name exists in multiple wilayas (43 such names in the real
// dataset, e.g. "Bougara" is a commune of both Blida and Tiaret) — callers
// must not guess which one in that case.
export function findWilayasByCommune<T extends WilayaCommuneList>(raw: string, wilayas: T[]): T[] {
  const key = normalizeGeoKey(raw);
  if (!key) return [];
  return wilayas.filter(w => w.communes.some(c => normalizeGeoKey(c) === key));
}
