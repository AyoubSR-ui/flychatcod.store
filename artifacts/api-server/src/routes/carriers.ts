import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireOwnerOrAdmin } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { ensureCarrierTables } from "../lib/schema-bootstrap.js";
import { CARRIER_REGISTRY, getCarrierMeta, createCarrierAdapter } from "../lib/carriers/index.js";
import { getWilayaCode, isValidCommuneForWilaya, resolveCommuneName } from "../lib/carriers/wilaya-codes.js";
import { encryptCredentials, decryptCredentials } from "../lib/credentials-crypto.js";
import { logOrderEvent } from "../lib/order-events.js";
import { refreshCarrierGeoCache, getCarrierGeoCache } from "../lib/carrier-geo-cache.js";
import { verifyCarrierConnection, getCarrierVerification } from "../lib/carrier-verification.js";
import { ALGERIA_WILAYAS } from "../lib/carriers/algeria-communes-data.js";
import { normalizeGeoKey } from "@workspace/db";

const router = Router();

// Orders created before orders.commune existed (or before an agent has had
// a chance to fix one via OrderDetail's dropdown) shouldn't suddenly start
// getting blocked from dispatch by a check that didn't exist when they were
// created — ~309 existing orders have a bad/missing commune, and blocking
// all of them at once would just be a new outage, not a fix. A hardcoded
// date (rather than reading the migration's actual run timestamp from the
// DB) — no DB round-trip needed on every dispatch, no metadata to persist;
// accurate as long as the migration runs the same day this ships, which is
// the plan. Bump this if the deploy slips to a different day than intended.
const COMMUNE_VALIDATION_CUTOFF = new Date("2026-09-17T00:00:00Z");

// ─── GET /api/carriers — registry + connected accounts ────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ registry: CARRIER_REGISTRY, connections: [] }); return; }

    const { rows } = await pool.query(
      `SELECT cc.id, cc.carrier, cc.label, cc.status, cc.created_at,
              v.status AS verification_status, v.checked_at AS verification_checked_at,
              v.message AS verification_message, v.failure_reason AS verification_failure_reason
       FROM carrier_connections cc
       LEFT JOIN carrier_connection_verifications v ON v.carrier_connection_id = cc.id
       WHERE cc.store_id = $1
       ORDER BY cc.created_at DESC`,
      [storeId]
    );
    // `status` on the connection row itself (connected/error/disconnected) is a
    // separate, older concept — verification is nested so the UI can't confuse
    // "credentials were saved" with "credentials were confirmed to work."
    const connections = rows.map((r) => ({
      id: r.id, carrier: r.carrier, label: r.label, status: r.status, created_at: r.created_at,
      verification: r.verification_status
        ? {
            status: r.verification_status,
            checkedAt: r.verification_checked_at,
            message: r.verification_message,
            failureReason: r.verification_failure_reason,
          }
        : null,
    }));
    res.json({ registry: CARRIER_REGISTRY, connections });
  } catch (err) {
    console.error("[Carriers] List error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Static-dataset shape, wrapped to match the carrier-sourced response below —
// hasStopDesk is always false and carriers always [] here since the static
// list has never carried stop-desk information (see algeria-communes.json);
// this is "the same dataset GET /geo/wilayas already serves," not a claim.
function staticCommunesResponse() {
  return ALGERIA_WILAYAS.map((w) => ({
    code: w.code,
    name: w.name,
    communes: w.communes.map((name) => ({ name, hasStopDesk: false, carriers: [] as string[] })),
  }));
}

// ─── GET /api/carriers/communes — union of connected carriers' communes ───────
// Per-store: union of every connected carrier's cached commune list (see
// carrier-geo-cache.ts), tagged with which carrier(s) reported each commune
// and true if ANY of them reports stop-desk availability there. Falls back to
// the static dataset, unchanged, whenever there's nothing carrier-sourced to
// show yet (no connections, or connections that haven't synced successfully
// even once) — this must never return an empty list.
//
// This does not replace dispatch-time validation: a commune appearing here as
// desk-capable only means at least one connected carrier reports it that
// way, not necessarily the specific carrier an agent goes on to pick at
// dispatch. That check stays carrier-specific, at dispatch (unchanged by this
// endpoint — see dispatchOrderToCarrier below).
router.get("/communes", requireAuth, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ source: "static", wilayas: staticCommunesResponse() }); return; }

    const { rows: cacheRows } = await pool.query(
      `SELECT cc.carrier, g.communes
       FROM carrier_connections cc
       JOIN carrier_connection_geo_cache g ON g.carrier_connection_id = cc.id
       WHERE cc.store_id = $1 AND cc.status = 'connected' AND jsonb_array_length(g.communes) > 0`,
      [storeId]
    );

    if (cacheRows.length === 0) {
      res.json({ source: "static", wilayas: staticCommunesResponse() });
      return;
    }

    // Merge key: wilaya code + accent/case/hyphen-insensitive commune name
    // (normalizeGeoKey — same normalization used everywhere else this
    // dataset is matched, see wilaya-codes.ts) so two carriers spelling the
    // same commune slightly differently still merge into one entry rather
    // than showing up twice.
    const merged = new Map<string, { wilayaCode: number; name: string; hasStopDesk: boolean; carriers: Set<string> }>();
    for (const row of cacheRows) {
      const communes = Array.isArray(row.communes) ? row.communes : [];
      for (const c of communes) {
        if (!c?.name || !c?.wilayaCode) continue;
        const key = `${c.wilayaCode}::${normalizeGeoKey(c.name)}`;
        const existing = merged.get(key);
        if (existing) {
          existing.hasStopDesk = existing.hasStopDesk || !!c.hasStopDesk;
          existing.carriers.add(row.carrier);
        } else {
          merged.set(key, { wilayaCode: c.wilayaCode, name: c.name, hasStopDesk: !!c.hasStopDesk, carriers: new Set([row.carrier]) });
        }
      }
    }

    const byWilaya = new Map<number, { name: string; hasStopDesk: boolean; carriers: string[] }[]>();
    for (const entry of merged.values()) {
      if (!byWilaya.has(entry.wilayaCode)) byWilaya.set(entry.wilayaCode, []);
      byWilaya.get(entry.wilayaCode)!.push({ name: entry.name, hasStopDesk: entry.hasStopDesk, carriers: Array.from(entry.carriers) });
    }

    let wilayas = Array.from(byWilaya.entries())
      .map(([code, communes]) => ({
        code,
        name: ALGERIA_WILAYAS.find((w) => w.code === code)?.name ?? String(code),
        communes: communes.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.code - b.code);

    const wilayaFilter = req.query.wilaya != null ? Number(req.query.wilaya) : null;
    if (wilayaFilter) wilayas = wilayas.filter((w) => w.code === wilayaFilter);

    res.json({ source: "carriers", wilayas });
  } catch (err) {
    console.error("[Carriers] Communes error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /api/carriers/connect — generic connect flow ────────────────────────
router.post("/connect", requireOwnerOrAdmin, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { carrier, label, credentials } = req.body as { carrier?: string; label?: string; credentials?: Record<string, string> };
    if (!carrier || !label) { res.status(400).json({ error: "validation_error", message: "carrier and label are required" }); return; }

    const meta = getCarrierMeta(carrier);
    if (!meta) { res.status(400).json({ error: "unknown_carrier", message: `Unknown carrier "${carrier}"` }); return; }
    if (meta.status !== "live") {
      res.status(400).json({ error: "not_available", message: `${meta.name} integration is in progress — not available yet.` });
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

    // Awaited (unlike the geo cache below): the whole point of verification is
    // that the connect response itself reflects real state instead of
    // "Connected" meaning only "credentials were saved" — see the carrier
    // verification project. Bounded by each adapter's own probe timeout (10s
    // for Ecotrack); verifyCarrierConnection never throws past its own
    // boundary, but this is still wrapped defensively in case of a genuinely
    // unexpected DB error, so a verification hiccup can never fail the connect.
    const verification = await verifyCarrierConnection(id).catch((err) => {
      console.error("[Carriers] Initial verification failed:", err);
      return null;
    });

    res.status(201).json({
      id, carrier, label, status: "connected",
      verification: verification
        ? {
            status: verification.status,
            checkedAt: verification.checked_at,
            message: verification.message,
            failureReason: verification.failure_reason,
          }
        : null,
    });

    // Fire-and-forget: populate the geo cache (communes/desks/fees) right
    // away rather than waiting for tomorrow's cron. Never awaited — must not
    // delay the connect response — and any failure here is just logged; a
    // fresh connection with no cache yet is indistinguishable from a carrier
    // that doesn't support this at all (both fall back to the static dataset).
    refreshCarrierGeoCache(id).catch((err) => console.error("[Carriers] Initial geo cache fetch failed:", err));
  } catch (err) {
    console.error("[Carriers] Connect error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── PATCH /api/carriers/:id/rename — rename a connected account's label ──────
router.patch("/:id/rename", requireOwnerOrAdmin, async (req, res) => {
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

// ─── POST /api/carriers/:id/verify — re-run the connection probe on demand ─────
// Same probe as the one run automatically on connect (see verifyCarrierConnection)
// — read-only, never mutates carrier-side state. Lets a merchant re-check after
// fixing credentials without disconnecting and reconnecting.
router.post("/:id/verify", requireOwnerOrAdmin, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { rows: ownRows } = await pool.query(
      `SELECT id FROM carrier_connections WHERE id = $1 AND store_id = $2 LIMIT 1`,
      [req.params.id, storeId]
    );
    if (!ownRows[0]) { res.status(404).json({ error: "not_found" }); return; }

    const verification = await verifyCarrierConnection(String(req.params.id));
    if (!verification) { res.status(404).json({ error: "not_found" }); return; }

    res.json({
      status: verification.status,
      checkedAt: verification.checked_at,
      probePath: verification.probe_path,
      httpStatus: verification.http_status,
      carrierErrorCode: verification.carrier_error_code,
      message: verification.message,
      failureReason: verification.failure_reason,
      latencyMs: verification.latency_ms,
    });
  } catch (err) {
    console.error("[Carriers] Verify error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /api/carriers/:id/refresh-geo — re-run the geo cache fetch on demand ─
// Same fetch as the one run automatically on connect and by the daily cron
// (see refreshCarrierGeoCache) — read-only against the carrier's API. Exists
// so a cache can be re-populated (e.g. after a parser fix) without waiting
// for the next deploy's boot-time run or the next 24h cron tick.
router.post("/:id/refresh-geo", requireOwnerOrAdmin, async (req, res) => {
  try {
    await ensureCarrierTables();
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { rows: ownRows } = await pool.query(
      `SELECT id FROM carrier_connections WHERE id = $1 AND store_id = $2 LIMIT 1`,
      [req.params.id, storeId]
    );
    if (!ownRows[0]) { res.status(404).json({ error: "not_found" }); return; }

    await refreshCarrierGeoCache(String(req.params.id));
    const cache = await getCarrierGeoCache(String(req.params.id));
    if (!cache) { res.status(404).json({ error: "not_found" }); return; }

    res.json({
      fetchedAt: cache.fetched_at,
      lastAttemptedAt: cache.last_attempted_at,
      lastError: cache.last_error,
      communeCount: Array.isArray(cache.communes) ? cache.communes.length : 0,
      deskCount: Array.isArray(cache.desks) ? cache.desks.length : 0,
      feeCount: Array.isArray(cache.fees) ? cache.fees.length : 0,
    });
  } catch (err) {
    console.error("[Carriers] Refresh geo error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── DELETE /api/carriers/:id — disconnect an account ──────────────────────────
router.delete("/:id", requireOwnerOrAdmin, async (req, res) => {
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

// ─── Product list formatting — shared by every carrier's `produit` field ──────
// Both order.items (Shopify-synced JSONB) and the order_items table fallback
// carry the variant as a single combined string (e.g. "Olive green / XL") —
// there's no separate color/size field anywhere in this schema.
function formatProductList(items: any[]): string {
  const formatted = (items || [])
    .map((i: any) => {
      const name = i.title || i.name || i.productName;
      if (!name) return null;
      const variant = i.variant_title || i.variant;
      const qty = i.quantity || 1;
      let product = variant ? `${name} - ${variant}` : name;
      if (qty > 1) product += ` x${qty}`;
      return product;
    })
    .filter(Boolean)
    .join(", ");
  return formatted || "Produit";
}

// ─── Dispatch helper — mounted under /api/orders/:id/dispatch in orders.ts ────
export async function dispatchOrderToCarrier(storeId: string, orderId: string, carrierConnectionId: string) {
  await ensureCarrierTables();

  const { rows: connRows } = await pool.query(
    `SELECT * FROM carrier_connections WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [carrierConnectionId, storeId]
  );
  const connection = connRows[0];
  if (!connection) throw new Error("Carrier account not found");

  // ─── Verification gate ───────────────────────────────────────────────────────
  // failed: credentials are confirmed not to work — block before spending an
  //   API call on a connection that will just reject it, same reasoning as the
  //   commune validation below. A merchant fixes credentials and re-verifies
  //   (POST /api/carriers/:id/verify) to clear this.
  // unverified (including no verification row at all — connections made before
  //   this feature shipped, or a carrier with no probe yet): allowed, with a
  //   warning carried through to the dispatch response rather than silently
  //   proceeding as if nothing were unknown.
  // verified: proceeds normally, no warning.
  const verification = await getCarrierVerification(carrierConnectionId);
  if (verification?.status === "failed") {
    throw new Error(
      `This carrier connection failed verification` +
      `${verification.failure_reason ? ` (${verification.failure_reason})` : ""}` +
      `: ${verification.message || "no details recorded"}. Fix the credentials and re-verify before dispatching.`
    );
  }
  const dispatchWarning = !verification || verification.status === "unverified"
    ? "This carrier connection hasn't been verified as working — dispatching anyway, but check the result carefully."
    : undefined;

  const { rows: orderRows } = await pool.query(
    `SELECT o.*, COALESCE(
        (SELECT json_agg(json_build_object('name', oi.product_name, 'quantity', oi.quantity, 'variant_title', oi.variant))
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
  const productList = formatProductList(items);

  const shipmentId = generateId("ship");
  try {
    const isPreExisting = new Date(order.created_at) < COMMUNE_VALIDATION_CUTOFF;

    let toCommune: string;
    if (isPreExisting) {
      // Unchanged pre-fix behavior: send whatever's available, never block.
      // If an agent has since fixed the commune via OrderDetail's dropdown
      // (which only offers valid options for the order's wilaya), that
      // fixed value is preferred automatically — no separate "revalidate"
      // step needed, this just picks it up.
      toCommune = order.commune || order.address || order.wilaya;
    } else {
      const wilayaCode = getWilayaCode(order.wilaya);

      // ─── Commune resolution against THIS connection's carrier data ──────────
      // The static dataset (dzship) and a real carrier's own commune list
      // don't always agree on spelling — e.g. the static list's
      // "Beni-Douala" vs Ecotrack's own "Beni Douala". Sending the static
      // dataset's canonical spelling to a carrier that doesn't recognize it
      // gets rejected as "commune mal écrite" even though the commune is
      // real. Once this connection has synced its own commune list
      // (carrier_connection_geo_cache), that list is authoritative — match
      // into it and send its exact `name`, never the static dataset's
      // spelling. Only fall back to the static dataset when this specific
      // connection's cache is empty (nothing carrier-sourced to check yet).
      const { rows: geoRows } = await pool.query(
        `SELECT communes FROM carrier_connection_geo_cache WHERE carrier_connection_id = $1 LIMIT 1`,
        [carrierConnectionId]
      );
      const cachedCommunes: any[] = Array.isArray(geoRows[0]?.communes) ? geoRows[0].communes : [];

      if (cachedCommunes.length > 0) {
        const target = normalizeGeoKey(order.commune || "");
        const match = cachedCommunes.find(
          (c: any) => Number(c?.wilayaCode) === wilayaCode && normalizeGeoKey(String(c?.name || "")) === target
        );
        if (!match) {
          throw new Error(`Commune not recognised by ${connection.carrier}: "${order.commune || "(none set)"}"`);
        }
        // Block before spending an API call the carrier will just reject —
        // stop-desk needs the matched commune to actually offer it with
        // THIS carrier, not just be a valid commune in general.
        if (order.shipping_option === "stopdesk" && !match.hasStopDesk) {
          throw new Error(
            `${match.name} doesn't have stop-desk service with ${connection.carrier} — switch to home delivery or pick a different commune.`
          );
        }
        toCommune = match.name;
      } else {
        // No carrier-sourced data yet for this connection — fall back to the
        // static dataset, unchanged from before this fix. Block before
        // spending an API call on a commune the courier will just reject as
        // "commune mal écrite" — name the actual problem rather than
        // surfacing whatever error text the carrier sends back for it.
        if (!isValidCommuneForWilaya(order.commune, wilayaCode)) {
          throw new Error(
            order.commune
              ? `"${order.commune}" is not a valid commune for ${order.wilaya}. Fix the order's commune before creating a parcel.`
              : `This order has no commune set for ${order.wilaya}. Set one before creating a parcel.`
          );
        }
        toCommune = resolveCommuneName(order.commune, wilayaCode);
      }
    }

    const result = await adapter.createShipment({
      orderId: order.id,
      orderNumber: order.order_number,
      customerFirstName: firstName || order.customer_name || "",
      customerLastName: rest.join(" "),
      customerPhone: order.customer_phone,
      address: order.address || "",
      fromWilaya: "Alger",
      toWilaya: order.wilaya,
      toCommune,
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

    return { trackingNumber: result.trackingNumber, status: "label_created", warning: dispatchWarning };
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

  // result.status isn't always a valid shipments.status enum value — Ecotrack
  // returns "manual_tracking_required" (no real status API exists there), and
  // writing that into the enum column would throw. Only persist recognized
  // values; always persist raw_response so the frontend can still surface a
  // manual tracking link when the status itself isn't a known enum member.
  const KNOWN_SHIPMENT_STATUSES = new Set([
    "not_shipped", "label_created", "label_purchased", "label_printed",
    "confirmed", "in_transit", "out_for_delivery", "delivered", "failed", "cancelled",
  ]);
  if (KNOWN_SHIPMENT_STATUSES.has(result.status)) {
    await pool.query(
      `UPDATE shipments SET status = $1, raw_response = $2, updated_at = NOW() WHERE id = $3`,
      [result.status, JSON.stringify(result.raw), shipment.id]
    );
  } else {
    await pool.query(
      `UPDATE shipments SET raw_response = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(result.raw), shipment.id]
    );
  }

  return { status: result.status, raw: result.raw };
}
