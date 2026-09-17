// Single source of truth for Algeria's wilaya/commune data — previously
// duplicated verbatim in artifacts/flychat/src/data/algeria-communes.ts
// (deleted; the frontend now fetches this via GET /api/geo/wilayas, see
// routes/geo.ts) and inlined a third time as a plain wilaya-name array in
// Orders.tsx. Real dataset: 58 wilayas, 1541 communes — sourced from
// https://raw.githubusercontent.com/DZBuild-com/dzship/main/data/wilayas.json
// and .../data/communes.json (fetched directly, not hand-transcribed).
//
// The actual data lives in ./algeria-communes.json rather than as a TS
// literal here so that lib/db/add-orders-commune.cjs (and any future plain
// Node script) can require() it directly, with no TS build step.
import data from "./algeria-communes.json";

export interface Wilaya {
  code: number;
  name: string;
  nameAr: string;
  communes: string[];
}

export const ALGERIA_WILAYAS: Wilaya[] = data as Wilaya[];
