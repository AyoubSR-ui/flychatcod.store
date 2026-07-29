import { pool } from "@workspace/db";
import { generateId } from "./id.js";
import { ensureOrderEventsTable } from "./schema-bootstrap.js";

export type OrderEventType = "status_change" | "parcel_created" | "label_created" | "note_added";

export async function logOrderEvent(params: {
  orderId: string;
  eventType: OrderEventType;
  fromStatus?: string | null;
  toStatus?: string | null;
  description?: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await ensureOrderEventsTable();
  await pool.query(
    `INSERT INTO order_events (id, order_id, event_type, from_status, to_status, description, created_by, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      generateId("evt"),
      params.orderId,
      params.eventType,
      params.fromStatus || null,
      params.toStatus || null,
      params.description || null,
      params.createdBy,
      JSON.stringify(params.metadata || {}),
    ]
  );
}
