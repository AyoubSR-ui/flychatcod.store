import { pool } from "@workspace/db";
import { ensureCarrierTables } from "./schema-bootstrap.js";
import { createCarrierAdapter } from "./carriers/index.js";
import { decryptCredentials } from "./credentials-crypto.js";

// ─── Per-connection carrier geo cache ──────────────────────────────────────────
// Communes (+ stop-desk availability), desk locations, and per-wilaya fees,
// fetched straight from the carrier's own API via the optional
// CarrierAdapter.getGeoData() capability (see carriers/types.ts — only
// Ecotrack implements it today) and cached in carrier_connection_geo_cache,
// one row per connection, replaced wholesale on every successful refresh.
//
// Never blocks order creation or dispatch: neither function here throws past
// its own boundary. A carrier with no getGeoData is a silent no-op, not an
// error. A failed fetch leaves the previous cache (or none) in place and
// records the failure for visibility — it never wipes data that was already
// good.

export async function refreshCarrierGeoCache(connectionId: string): Promise<void> {
  await ensureCarrierTables();

  const { rows } = await pool.query(
    `SELECT id, carrier, credentials FROM carrier_connections WHERE id = $1 LIMIT 1`,
    [connectionId]
  );
  const connection = rows[0];
  if (!connection) return; // deleted since being queued — nothing to do

  let adapter;
  try {
    const credentials = connection.credentials ? decryptCredentials(connection.credentials) : {};
    adapter = createCarrierAdapter(connection.carrier, credentials);
  } catch {
    // Not implemented, or a malformed credentials blob — not a fetch failure,
    // just nothing to cache for this connection.
    return;
  }

  if (!adapter.getGeoData) return; // this carrier doesn't expose geo data yet

  try {
    const data = await adapter.getGeoData();
    await pool.query(
      `INSERT INTO carrier_connection_geo_cache
         (carrier_connection_id, carrier, communes, desks, fees, fetched_at, last_attempted_at, last_error, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), NULL, NOW())
       ON CONFLICT (carrier_connection_id) DO UPDATE SET
         carrier = EXCLUDED.carrier,
         communes = EXCLUDED.communes,
         desks = EXCLUDED.desks,
         fees = EXCLUDED.fees,
         fetched_at = NOW(),
         last_attempted_at = NOW(),
         last_error = NULL,
         updated_at = NOW()`,
      [connectionId, connection.carrier, JSON.stringify(data.communes), JSON.stringify(data.desks), JSON.stringify(data.fees)]
    );
    console.log(
      `[CarrierGeoCache] Refreshed ${connection.carrier} (${connectionId}): ` +
      `${data.communes.length} communes, ${data.desks.length} desks, ${data.fees.length} fee rows.`
    );
  } catch (err: any) {
    // Keep whatever was cached before (if anything) — record only that this
    // attempt failed. A transient carrier-side error must never erase a
    // previously-good cache.
    await pool.query(
      `INSERT INTO carrier_connection_geo_cache (carrier_connection_id, carrier, last_attempted_at, last_error, updated_at)
       VALUES ($1, $2, NOW(), $3, NOW())
       ON CONFLICT (carrier_connection_id) DO UPDATE SET
         last_attempted_at = NOW(),
         last_error = EXCLUDED.last_error,
         updated_at = NOW()`,
      [connectionId, connection.carrier, err?.message || String(err)]
    );
    console.error(`[CarrierGeoCache] Refresh failed for ${connection.carrier} (${connectionId}):`, err?.message || err);
  }
}

export async function getCarrierGeoCache(connectionId: string) {
  await ensureCarrierTables();
  const { rows } = await pool.query(
    `SELECT * FROM carrier_connection_geo_cache WHERE carrier_connection_id = $1 LIMIT 1`,
    [connectionId]
  );
  return rows[0] ?? null;
}

export async function refreshAllCarrierGeoCaches(): Promise<void> {
  await ensureCarrierTables();
  const { rows } = await pool.query(`SELECT id FROM carrier_connections WHERE status = 'connected'`);
  console.log(`[CarrierGeoCache] Daily refresh: ${rows.length} connected carrier account(s).`);
  for (const row of rows) {
    // Sequential, not parallel — avoids hammering multiple carrier APIs (or
    // one carrier's multiple tenants) at once. refreshCarrierGeoCache already
    // catches its own errors; this catch is only a last-resort net.
    await refreshCarrierGeoCache(row.id).catch((err) => {
      console.error(`[CarrierGeoCache] Unexpected error refreshing ${row.id}:`, err);
    });
  }
}

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function startCarrierGeoRefreshCron(): void {
  console.log("[CarrierGeoCache] Cron job started — runs every 24 hours.");
  // Run once on startup so a restart doesn't wait a full day for stale/missing
  // caches to catch up, then every 24 hours after that.
  refreshAllCarrierGeoCaches();
  setInterval(refreshAllCarrierGeoCaches, REFRESH_INTERVAL_MS);
}
