/**
 * Orders Commune Backfill — re-runnable, idempotent, safe to run repeatedly.
 * Dry-run by default; pass --apply to actually write.
 *
 * Run (dry run, no writes):
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-orders-commune.ts
 * Run (writes):
 *   pnpm --filter @workspace/scripts exec tsx ./src/backfill-orders-commune.ts --apply
 *
 * History: the original migration (lib/db/add-orders-commune.cjs) matched
 * wilaya case-insensitively but commune case-sensitively, with no Arabic or
 * accent handling on either side — recovered 130/740. A first pass at this
 * script added wilaya normalization (resolveWilayaName — Arabic-script,
 * Darija-Latin slang, and Latin+Arabic mixed values like
 * "SIDI BEL ABBES سيدي بلعباس") and case/accent-insensitive commune matching
 * — recovered 119 more (252/744). Auditing the remaining 380 unresolved
 * found most aren't wilaya values at all: the AI wrote a commune name into
 * the wilaya column ("Bir el Djir" for Oran, "Bab Ezzouar" for Alger, etc).
 *
 * Two passes now:
 *   1. wilaya resolves to a real wilaya (resolveWilayaName) — match address
 *      against that wilaya's communes (normalizeGeoKey on both sides).
 *   2. wilaya doesn't resolve as a wilaya at all — check it against every
 *      commune in the dataset (findWilayasByCommune). Exactly one wilaya
 *      match: infer that wilaya, set commune to the exact matched spelling.
 *      More than one match (a commune name that exists in multiple
 *      wilayas — 43 such names in the real dataset, e.g. "Bougara" is a
 *      commune of both Blida and Tiaret): leave it, report it as
 *      ambiguous. Never guess which wilaya.
 *
 * Only ever fills commune (and, for pass 2, wilaya) where commune is still
 * NULL — never overwrites an existing value. Running this multiple times,
 * or any time after add-orders-commune.cjs, is always safe: each run just
 * narrows the remaining NULL set.
 *
 * Left alone on purpose, not specially-cased: orders with wilaya = "-" (or
 * anything else that resolves as neither a wilaya nor a commune) — nothing
 * to normalize a placeholder into. They fall into "still unresolved" below
 * and need a human, not a smarter matcher.
 */
import { pool, resolveWilayaName, normalizeGeoKey, findWilayasByCommune } from "@workspace/db";
import wilayasData from "../../artifacts/api-server/src/lib/carriers/algeria-communes.json";

interface Wilaya { code: number; name: string; nameAr: string; communes: string[]; }
const WILAYAS = wilayasData as Wilaya[];
const WILAYA_NAMES = WILAYAS.map(w => w.name);
const WILAYA_BY_NAME = new Map(WILAYAS.map(w => [w.name, w]));

const APPLY = process.argv.includes("--apply");

(async () => {
  console.log(APPLY ? "[Backfill] APPLY mode — writing changes." : "[Backfill] DRY RUN — no writes. Pass --apply to write.");

  const { rows: candidates } = await pool.query(
    `SELECT id, wilaya, address FROM orders WHERE commune IS NULL`
  );
  console.log(`[Backfill] ${candidates.length} order(s) still missing a commune.`);

  let recoveredByWilayaNormalization = 0;
  let recoveredByCommuneInference = 0;
  let wilayaResolvedNoAddress = 0;
  let communeStillNoMatch = 0;
  let stillUnresolved = 0;
  const ambiguous: { id: string; wilaya: string; matchedWilayas: string[] }[] = [];
  const unresolvedSamples = new Map<string, number>();

  for (const row of candidates) {
    const rawWilaya = row.wilaya || "";

    // ── Pass 1: wilaya resolves as a real wilaya ──────────────────────────
    const resolvedName = resolveWilayaName(rawWilaya, WILAYA_NAMES);
    if (resolvedName) {
      if (!row.address) { wilayaResolvedNoAddress++; continue; }

      const wilaya = WILAYA_BY_NAME.get(resolvedName)!;
      const addressKey = normalizeGeoKey(row.address);
      const match = wilaya.communes.find(c => normalizeGeoKey(c) === addressKey);
      if (!match) { communeStillNoMatch++; continue; }

      if (APPLY) {
        await pool.query(
          `UPDATE orders SET commune = $1, updated_at = NOW() WHERE id = $2 AND commune IS NULL`,
          [match, row.id]
        );
      }
      recoveredByWilayaNormalization++;
      continue;
    }

    // ── Pass 2: wilaya doesn't resolve — maybe it's actually a commune ────
    const matchingWilayas = findWilayasByCommune(rawWilaya, WILAYAS);
    if (matchingWilayas.length === 1) {
      const wilaya = matchingWilayas[0];
      const target = normalizeGeoKey(rawWilaya);
      const commune = wilaya.communes.find(c => normalizeGeoKey(c) === target)!;

      if (APPLY) {
        await pool.query(
          `UPDATE orders SET wilaya = $1, commune = $2, updated_at = NOW() WHERE id = $3 AND commune IS NULL`,
          [wilaya.name, commune, row.id]
        );
      }
      recoveredByCommuneInference++;
      continue;
    }

    if (matchingWilayas.length > 1) {
      ambiguous.push({ id: row.id, wilaya: rawWilaya, matchedWilayas: matchingWilayas.map(w => w.name) });
      continue;
    }

    stillUnresolved++;
    unresolvedSamples.set(rawWilaya, (unresolvedSamples.get(rawWilaya) || 0) + 1);
  }

  console.log(`\n[Backfill] ${APPLY ? "Fixed" : "Would fix"} by wilaya normalization: ${recoveredByWilayaNormalization}`);
  console.log(`[Backfill] ${APPLY ? "Fixed" : "Would fix"} by commune-to-wilaya inference: ${recoveredByCommuneInference}`);
  console.log(`[Backfill] Ambiguous — commune name matches >1 wilaya, left alone: ${ambiguous.length}`);
  if (ambiguous.length) {
    console.log(`[Backfill] Ambiguous details (order id, raw wilaya value, candidate wilayas):`);
    for (const a of ambiguous) console.log(`  ${a.id}  "${a.wilaya}"  ->  ${a.matchedWilayas.join(" / ")}`);
  }
  console.log(`[Backfill] Wilaya resolved OK, but no address to check for a commune, left NULL: ${wilayaResolvedNoAddress}`);
  console.log(`[Backfill] Wilaya resolved OK, but address doesn't match any commune for it, left NULL: ${communeStillNoMatch}`);
  console.log(`[Backfill] Still unresolved — neither a wilaya nor a commune (includes "-" — need a human): ${stillUnresolved}`);

  const topUnresolved = [...unresolvedSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (topUnresolved.length) console.log(`[Backfill] Top unresolved raw values (value, count):`, topUnresolved);

  const { rows: totals } = await pool.query(`SELECT COUNT(*) AS total, COUNT(commune) AS with_commune FROM orders`);
  console.log(`\n[Backfill] ${totals[0].with_commune}/${totals[0].total} orders currently have a commune${APPLY ? "" : " (before this run — dry run made no changes)"}.`);

  await pool.end();
})().catch(e => { console.error("[Backfill] ERR", e.message); process.exit(1); });
