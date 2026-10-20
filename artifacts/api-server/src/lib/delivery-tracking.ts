import { pool } from "@workspace/db";
import { ensureCarrierTables, ensureDeliveryTrackingSchema } from "./schema-bootstrap.js";
import { createCarrierAdapter } from "./carriers/index.js";
import { decryptCredentials } from "./credentials-crypto.js";
import { applyShipmentStatusResult } from "../routes/carriers.js";
import { TERMINAL_SHIPMENT_STATUSES } from "./fulfillment-status.js";

// Polls every carrier connection's shipments for a current status, modeled on
// scheduled-parcels.ts's executor but on a longer interval (carriers don't
// update faster than every ~30 min, so there's no value in polling more
// often — it would just burn through Ecotrack's 50 req/min limit for nothing).
//
// Orders are grouped by carrier_connection_id (not just by `carrier` name —
// two connections could theoretically hold different tokens for the same
// carrier) so each connection's shipments go out as one batched HTTP call
// where the adapter supports it (Ecotrack: up to 100 trackings per call,
// chunked inside the adapter itself), rather than one call per order. A
// carrier whose adapter has no getStatusBatch falls back to one getStatus()
// call per order — today that's dead code in practice (every "live" carrier
// is an Ecotrack tenant, see carriers/registry.ts), but keeps this correct
// if a second carrier goes live without batch support.
//
// One connection failing (bad token, carrier outage, rate limit) must not
// stop any other connection's polling — each connection's batch is wrapped
// in its own try/catch.
async function pollDueShipments(): Promise<void> {
  await ensureCarrierTables();
  await ensureDeliveryTrackingSchema();
  console.log("[DeliveryTracking] Polling carriers for shipment status updates...");

  const { rows: shipments } = await pool.query(
    `SELECT id, order_id, store_id, carrier, carrier_connection_id, tracking_number, status
     FROM shipments
     WHERE tracking_number IS NOT NULL
       AND status NOT IN (${TERMINAL_SHIPMENT_STATUSES.map((_, i) => `$${i + 1}`).join(",")})
     ORDER BY updated_at ASC
     LIMIT 5000`,
    [...TERMINAL_SHIPMENT_STATUSES]
  );

  if (shipments.length === 0) {
    console.log("[DeliveryTracking] No non-terminal shipments to poll.");
    return;
  }

  const byConnection = new Map<string, typeof shipments>();
  for (const s of shipments) {
    const list = byConnection.get(s.carrier_connection_id) || [];
    list.push(s);
    byConnection.set(s.carrier_connection_id, list);
  }
  console.log(`[DeliveryTracking] ${shipments.length} shipment(s) across ${byConnection.size} carrier connection(s).`);

  let updated = 0;
  let notFound = 0;

  for (const [connectionId, connShipments] of byConnection) {
    try {
      const { rows: connRows } = await pool.query(`SELECT * FROM carrier_connections WHERE id = $1 LIMIT 1`, [connectionId]);
      const connection = connRows[0];
      if (!connection) {
        console.warn(`[DeliveryTracking] carrier_connection_id ${connectionId} no longer exists — skipping ${connShipments.length} shipment(s).`);
        continue;
      }

      const credentials = connection.credentials ? decryptCredentials(connection.credentials) : {};
      const adapter = createCarrierAdapter(connection.carrier, credentials);
      const trackingNumbers: string[] = connShipments.map(s => s.tracking_number);

      let resultsByTracking: Record<string, { status: string; raw: Record<string, unknown> }>;
      if (adapter.getStatusBatch) {
        resultsByTracking = await adapter.getStatusBatch(trackingNumbers);
      } else {
        // No batch support — one call per order, sequentially (not
        // Promise.all) so a slow/rate-limited carrier here can't fan out
        // into dozens of concurrent requests at once.
        resultsByTracking = {};
        for (const tn of trackingNumbers) {
          try {
            resultsByTracking[tn] = await adapter.getStatus(tn);
          } catch (err) {
            console.error(`[DeliveryTracking] getStatus failed for tracking ${tn} (connection ${connectionId}):`, err);
          }
        }
      }

      for (const shipment of connShipments) {
        const result = resultsByTracking[shipment.tracking_number];
        if (!result) {
          // Not present in the carrier's response — could be too new, could
          // be a typo'd/cancelled-before-pickup tracking number. Not an
          // error: left untouched, same "fail soft" rule as an unrecognized
          // status value.
          notFound++;
          continue;
        }
        try {
          // applyShipmentStatusResult itself logs an unrecognized raw status
          // distinctly (console.warn) — this just tallies actual changes for
          // the run-level summary below.
          const { changed } = await applyShipmentStatusResult(shipment, result.status, result.raw);
          if (changed) updated++;
        } catch (err) {
          console.error(`[DeliveryTracking] Failed to apply status for shipment ${shipment.id}:`, err);
        }
      }
    } catch (err) {
      console.error(`[DeliveryTracking] Carrier connection ${connectionId} failed — other connections unaffected:`, err);
    }
  }

  console.log(`[DeliveryTracking] Poll complete: ${updated} shipment(s) changed status, ${notFound} not found at carrier.`);
}

const INTERVAL_MS = 30 * 60 * 1000;

export function startDeliveryTrackingCron(): void {
  console.log("[DeliveryTracking] Delivery tracking poller started — runs every 30 minutes.");
  pollDueShipments().catch(err => console.error("[DeliveryTracking] Startup run failed:", err));
  setInterval(() => {
    pollDueShipments().catch(err => console.error("[DeliveryTracking] Cron run failed:", err));
  }, INTERVAL_MS);
}
