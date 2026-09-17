/**
 * Orders Commune Backfill — re-runnable, idempotent, safe to run repeatedly.
 *
 * The original migration (lib/db/add-orders-commune.cjs) matched wilaya
 * case-insensitively but commune case-sensitively, and neither side handled
 * Arabic script or accents — it only recovered 130 of 740 candidate orders.
 * This one reuses the shared normalizer (@workspace/db's resolveWilayaName /
 * normalizeGeoKey — see lib/db/src/geo-normalize.ts) on both sides:
 *   - wilaya: resolves Arabic-script, Darija-Latin slang, and Latin+Arabic
 *     mixed values ("SIDI BEL ABBES سيدي بلعباس") to the canonical name.
 *   - commune: matches case/accent/whitespace-insensitively instead of the
 *     original's exact TRIM(address) = ANY(...).
 *
 * Only ever fills commune where it's still NULL — never overwrites an
 * existing value. Running this multiple times, or any time after
 * add-orders-commune.cjs, is always safe: each run just narrows the
 * remaining NULL set (or changes nothing once there's nothing left to fix).
 *
 * Left alone on purpose, not specially-cased: orders with wilaya = "-" (or
 * any other value that doesn't resolve to a real wilaya) — normalizeWilaya
 * has nothing to normalize a placeholder into, so these fall into
 * "wilaya unresolved" below and stay NULL. They need a human, not a
 * smarter matcher.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx ./src/backfill-orders-commune.ts
 */
import { pool, resolveWilayaName, normalizeGeoKey } from "@workspace/db";
import wilayasData from "../../artifacts/api-server/src/lib/carriers/algeria-communes.json";

interface Wilaya { code: number; name: string; nameAr: string; communes: string[]; }
const WILAYAS = wilayasData as Wilaya[];
const WILAYA_NAMES = WILAYAS.map(w => w.name);
const WILAYA_BY_NAME = new Map(WILAYAS.map(w => [w.name, w]));

(async () => {
  const { rows: candidates } = await pool.query(
    `SELECT id, wilaya, address FROM orders WHERE commune IS NULL AND address IS NOT NULL`
  );
  console.log(`[Backfill] ${candidates.length} order(s) still missing a commune.`);

  let fixed = 0;
  let wilayaUnresolved = 0;
  let communeStillNoMatch = 0;
  const unresolvedWilayaSamples = new Map<string, number>();

  for (const row of candidates) {
    const resolvedName = resolveWilayaName(row.wilaya || "", WILAYA_NAMES);
    if (!resolvedName) {
      wilayaUnresolved++;
      unresolvedWilayaSamples.set(row.wilaya, (unresolvedWilayaSamples.get(row.wilaya) || 0) + 1);
      continue;
    }

    const wilaya = WILAYA_BY_NAME.get(resolvedName)!;
    const addressKey = normalizeGeoKey(row.address);
    const match = wilaya.communes.find(c => normalizeGeoKey(c) === addressKey);
    if (!match) { communeStillNoMatch++; continue; }

    const { rowCount } = await pool.query(
      `UPDATE orders SET commune = $1, updated_at = NOW() WHERE id = $2 AND commune IS NULL`,
      [match, row.id]
    );
    fixed += rowCount ?? 0;
  }

  console.log(`[Backfill] Fixed ${fixed} row(s) this run.`);
  console.log(`[Backfill] Wilaya unresolved, left NULL (includes the "-" orders — need a human): ${wilayaUnresolved}`);
  console.log(`[Backfill] Wilaya resolved OK, but address still doesn't match any commune for it, left NULL: ${communeStillNoMatch}`);

  const topUnresolved = [...unresolvedWilayaSamples.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (topUnresolved.length) console.log(`[Backfill] Top unresolved wilaya values (value, count):`, topUnresolved);

  const { rows: totals } = await pool.query(`SELECT COUNT(*) AS total, COUNT(commune) AS with_commune FROM orders`);
  console.log(`[Backfill] ${totals[0].with_commune}/${totals[0].total} orders now have a commune.`);

  await pool.end();
})().catch(e => { console.error("[Backfill] ERR", e.message); process.exit(1); });
