import { pool } from "@workspace/db";
import { ensureScheduledParcelsTable } from "./schema-bootstrap.js";
import { dispatchOrderToCarrier } from "../routes/carriers.js";
import { logOrderEvent } from "./order-events.js";

// Executes scheduled_parcels rows whose scheduled_date is due, reusing the
// same dispatchOrderToCarrier() the manual "Create Parcel" button calls —
// same credential handling, same shipments-row insert, same event logging.
async function executeDueScheduledParcels(): Promise<void> {
  await ensureScheduledParcelsTable();
  console.log("[Scheduler] Checking for due scheduled parcels...");

  const { rows: due } = await pool.query(
    `SELECT id, order_id, store_id, carrier_connection_id, result
     FROM scheduled_parcels
     WHERE status = 'pending' AND scheduled_date <= NOW()
     ORDER BY scheduled_date ASC
     LIMIT 50`
  );

  if (due.length === 0) {
    console.log("[Scheduler] No parcels due.");
    return;
  }
  console.log(`[Scheduler] ${due.length} parcel(s) due for creation.`);

  for (const scheduled of due) {
    try {
      const result = await dispatchOrderToCarrier(scheduled.store_id, scheduled.order_id, scheduled.carrier_connection_id);

      await pool.query(
        `UPDATE scheduled_parcels SET status = 'created', executed_at = NOW(), result = $1 WHERE id = $2`,
        [JSON.stringify(result), scheduled.id]
      );
      await pool.query(
        `UPDATE orders SET status = 'shipped', scheduled_ship_date = NULL, updated_at = NOW() WHERE id = $1 AND status = 'scheduled'`,
        [scheduled.order_id]
      );

      console.log(`[Scheduler] Created parcel ${result.trackingNumber} for order ${scheduled.order_id}`);
    } catch (err: any) {
      console.error(`[Scheduler] Failed for scheduled parcel ${scheduled.id}:`, err);
      await pool.query(
        `UPDATE scheduled_parcels SET result = $1 WHERE id = $2`,
        [JSON.stringify({ error: err.message || String(err), attemptedAt: new Date().toISOString() }), scheduled.id]
      ).catch(() => {});
      // Only log a merchant-visible event on the first failed attempt — a
      // stubbed/unreachable carrier would otherwise spam order_events every
      // 15 minutes until someone intervenes.
      if (!scheduled.result) {
        logOrderEvent({
          orderId: scheduled.order_id, eventType: "parcel_scheduled", createdBy: "System",
          description: `Échec de création automatique du colis programmé — ${err.message || "erreur inconnue"} (nouvelles tentatives toutes les 15 min)`,
        }).catch(() => {});
      }
    }
  }
}

const INTERVAL_MS = 15 * 60 * 1000;

export function startScheduledParcelsCron(): void {
  console.log("[Scheduler] Scheduled parcel executor started — runs every 15 minutes.");
  executeDueScheduledParcels().catch(err => console.error("[Scheduler] Startup run failed:", err));
  setInterval(() => {
    executeDueScheduledParcels().catch(err => console.error("[Scheduler] Cron run failed:", err));
  }, INTERVAL_MS);
}
