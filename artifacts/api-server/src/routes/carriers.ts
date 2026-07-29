import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { ensureCarrierTables } from "../lib/schema-bootstrap.js";
import { CARRIER_REGISTRY, getCarrierMeta, createCarrierAdapter } from "../lib/carriers/index.js";
import { encryptCredentials, decryptCredentials } from "../lib/credentials-crypto.js";
import { logOrderEvent } from "../lib/order-events.js";

const router = Router();

// ─── GET /api/carriers — registry + connected accounts ────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ registry: CARRIER_REGISTRY, connections: [] }); return; }

    const { rows } = await pool.query(
      `SELECT id, carrier, label, status, created_at FROM carrier_connections WHERE store_id = $1 ORDER BY created_at DESC`,
      [storeId]
    );
    res.json({ registry: CARRIER_REGISTRY, connections: rows });
  } catch (err) {
    console.error("[Carriers] List error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /api/carriers/connect — generic connect flow ────────────────────────
router.post("/connect", requireAuth, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { carrier, label, credentials } = req.body as { carrier?: string; label?: string; credentials?: Record<string, string> };
    if (!carrier || !label) { res.status(400).json({ error: "validation_error", message: "carrier and label are required" }); return; }

    const meta = getCarrierMeta(carrier);
    if (!meta) { res.status(400).json({ error: "unknown_carrier", message: `Unknown carrier "${carrier}"` }); return; }
    if (!meta.implemented) {
      res.status(400).json({ error: "not_implemented", message: `${meta.name} isn't connected yet — its API integration hasn't been built.` });
      return;
    }

    const missing = meta.credentialFields.filter((f) => !credentials?.[f.key]?.trim());
    if (missing.length > 0) {
      res.status(400).json({ error: "validation_error", message: `Missing: ${missing.map((f) => f.label).join(", ")}` });
      return;
    }

    const id = generateId("carr");
    await pool.query(
      `INSERT INTO carrier_connections (id, store_id, carrier, label, status, credentials, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'connected', $5, NOW(), NOW())`,
      [id, storeId, carrier, label, encryptCredentials(credentials!)]
    );

    res.status(201).json({ id, carrier, label, status: "connected" });
  } catch (err) {
    console.error("[Carriers] Connect error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── PATCH /api/carriers/:id/rename — rename a connected account's label ──────
router.patch("/:id/rename", requireAuth, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { label } = req.body as { label?: string };
    if (!label?.trim()) { res.status(400).json({ error: "validation_error", message: "label is required" }); return; }

    const { rows } = await pool.query(
      `UPDATE carrier_connections SET label = $1, updated_at = NOW() WHERE id = $2 AND store_id = $3 RETURNING id, carrier, label, status, created_at`,
      [label.trim(), req.params.id, storeId]
    );
    if (!rows[0]) { res.status(404).json({ error: "not_found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error("[Carriers] Rename error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── DELETE /api/carriers/:id — disconnect an account ──────────────────────────
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { rowCount } = await pool.query(
      `DELETE FROM carrier_connections WHERE id = $1 AND store_id = $2`,
      [req.params.id, storeId]
    );
    if (!rowCount) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("[Carriers] Disconnect error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;

// ─── Dispatch helper — mounted under /api/orders/:id/dispatch in orders.ts ────
export async function dispatchOrderToCarrier(storeId: string, orderId: string, carrierConnectionId: string) {
  await ensureCarrierTables();

  const { rows: connRows } = await pool.query(
    `SELECT * FROM carrier_connections WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [carrierConnectionId, storeId]
  );
  const connection = connRows[0];
  if (!connection) throw new Error("Carrier account not found");

  const { rows: orderRows } = await pool.query(
    `SELECT o.*, COALESCE(
        (SELECT json_agg(json_build_object('name', oi.product_name, 'quantity', oi.quantity))
         FROM order_items oi WHERE oi.order_id = o.id),
        '[]'
      ) as order_items
     FROM orders o WHERE o.id = $1 AND o.store_id = $2 LIMIT 1`,
    [orderId, storeId]
  );
  const order = orderRows[0];
  if (!order) throw new Error("Order not found");

  const credentials = connection.credentials ? decryptCredentials(connection.credentials) : {};
  const adapter = createCarrierAdapter(connection.carrier, credentials);

  const [firstName, ...rest] = String(order.customer_name || "").split(" ");
  const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : order.order_items;
  const productList = (items || []).map((i: any) => i.title || i.name || i.productName).filter(Boolean).join(", ") || "Produit";

  const shipmentId = generateId("ship");
  try {
    const result = await adapter.createShipment({
      orderId: order.id,
      orderNumber: order.order_number,
      customerFirstName: firstName || order.customer_name || "",
      customerLastName: rest.join(" "),
      customerPhone: order.customer_phone,
      address: order.address || "",
      fromWilaya: "Alger",
      toWilaya: order.wilaya,
      // NOTE: orders don't have a dedicated commune column — address is the
      // closest available field. A real gap, not a placeholder oversight.
      toCommune: order.address || order.wilaya,
      price: Number(order.total),
      productList,
      isStopdesk: order.shipping_option === "stopdesk",
      hasExchange: false,
      note: order.seller_note || undefined,
    });

    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, carrier_connection_id, carrier, tracking_number, status, label_url, raw_response, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'label_created', $7, $8, NOW(), NOW())`,
      [shipmentId, orderId, storeId, carrierConnectionId, connection.carrier, result.trackingNumber, result.labelUrl || null, JSON.stringify(result.raw)]
    );

    const carrierLabel = `${connection.label} (${connection.carrier})`;
    await logOrderEvent({
      orderId, eventType: "parcel_created", createdBy: "System",
      description: `Colis créé — ${carrierLabel}`,
      metadata: { carrier: connection.carrier, trackingNumber: result.trackingNumber },
    }).catch(err => console.error("[Carriers] Failed to log parcel_created event:", err));
    await logOrderEvent({
      orderId, eventType: "label_created", createdBy: "System",
      description: `${carrierLabel} – ${result.trackingNumber}`,
      metadata: { carrier: connection.carrier, trackingNumber: result.trackingNumber, labelUrl: result.labelUrl || null },
    }).catch(err => console.error("[Carriers] Failed to log label_created event:", err));

    return { trackingNumber: result.trackingNumber, status: "label_created" };
  } catch (err: any) {
    await pool.query(
      `INSERT INTO shipments (id, order_id, store_id, carrier_connection_id, carrier, status, raw_response, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'failed', $6, NOW(), NOW())`,
      [shipmentId, orderId, storeId, carrierConnectionId, connection.carrier, JSON.stringify({ error: err.message })]
    );
    throw err;
  }
}

// ─── Refresh helper — mounted under /api/orders/:id/refresh-tracking ─────────
export async function refreshShipmentStatus(storeId: string, orderId: string) {
  await ensureCarrierTables();

  const { rows: shipmentRows } = await pool.query(
    `SELECT * FROM shipments WHERE order_id = $1 AND store_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [orderId, storeId]
  );
  const shipment = shipmentRows[0];
  if (!shipment) throw new Error("No shipment found for this order");

  const { rows: connRows } = await pool.query(`SELECT * FROM carrier_connections WHERE id = $1 LIMIT 1`, [shipment.carrier_connection_id]);
  const connection = connRows[0];
  if (!connection) throw new Error("Carrier account not found");

  const credentials = connection.credentials ? decryptCredentials(connection.credentials) : {};
  const adapter = createCarrierAdapter(connection.carrier, credentials);

  const result = await adapter.getStatus(shipment.tracking_number);

  await pool.query(
    `UPDATE shipments SET raw_response = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(result.raw), shipment.id]
  );

  return { status: result.status, raw: result.raw };
}
