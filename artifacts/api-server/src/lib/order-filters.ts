import { pool } from "@workspace/db";

// How close together two orders with the same phone number need to be created
// to be flagged as possible duplicates of each other. Symmetric/pairwise —
// not relative to "now", so a flag doesn't silently disappear as time passes.
export const DUPLICATE_WINDOW_DAYS = 7;

export async function getDuplicateOrderIds(storeId: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT DISTINCT a.id
     FROM orders a
     JOIN orders b ON a.store_id = b.store_id
       AND a.customer_phone = b.customer_phone
       AND a.customer_phone IS NOT NULL AND a.customer_phone != ''
       AND a.id != b.id
       AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) <= $2
     WHERE a.store_id = $1`,
    [storeId, DUPLICATE_WINDOW_DAYS * 86400]
  );
  return new Set(rows.map((r: any) => r.id));
}

export async function getDuplicateMatches(storeId: string, orderIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (orderIds.length === 0) return map;
  const { rows } = await pool.query(
    `SELECT a.id, b.order_number
     FROM orders a
     JOIN orders b ON a.store_id = b.store_id
       AND a.customer_phone = b.customer_phone
       AND a.customer_phone IS NOT NULL AND a.customer_phone != ''
       AND a.id != b.id
       AND ABS(EXTRACT(EPOCH FROM (a.created_at - b.created_at))) <= $3
     WHERE a.store_id = $1 AND a.id = ANY($2)`,
    [storeId, orderIds, DUPLICATE_WINDOW_DAYS * 86400]
  );
  for (const r of rows as any[]) {
    const arr = map.get(r.id) || [];
    arr.push(r.order_number);
    map.set(r.id, arr);
  }
  return map;
}

// Base CTE shared by the orders list and KPI stats endpoints — computes the
// source channel, latest shipment (if any), and assigned agent name once, so
// both endpoints filter over the exact same derived columns.
export const ORDERS_BASE_CTE = `
  WITH base AS (
    SELECT o.*,
      CASE
        WHEN o.shopify_order_id IS NOT NULL THEN 'shopify'
        WHEN c.channel IS NOT NULL THEN c.channel::text
        ELSE 'manual'
      END AS computed_source,
      tm.name AS agent_name,
      sh.id AS shipment_id,
      sh.carrier AS shipment_carrier,
      sh.carrier_connection_id AS shipment_carrier_connection_id,
      sh.tracking_number AS shipment_tracking_number,
      sh.status AS shipment_status
    FROM orders o
    LEFT JOIN conversations c ON c.id = o.conversation_id
    LEFT JOIN team_members tm ON tm.id = o.assigned_agent_id
    LEFT JOIN LATERAL (
      SELECT * FROM shipments s WHERE s.order_id = o.id ORDER BY s.created_at DESC LIMIT 1
    ) sh ON true
    WHERE o.store_id = $1
  )
`;

export interface OrderFilterQuery {
  search?: string;
  status?: string;
  source?: string;
  delivery?: string;
  carrier?: string;
  agent?: string;
  product?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Builds the outer WHERE clause (referencing the `b` alias over ORDERS_BASE_CTE)
// plus the params array. values[0] is always storeId ($1, consumed by the CTE).
export async function buildOrderFilters(storeId: string, query: OrderFilterQuery): Promise<{ whereSQL: string; values: any[] }> {
  const values: any[] = [storeId];
  const clauses: string[] = [];

  if (query.search) {
    values.push(`%${query.search}%`);
    const i = values.length;
    clauses.push(`(b.customer_name ILIKE $${i} OR b.order_number ILIKE $${i} OR b.customer_phone ILIKE $${i})`);
  }

  if (query.status && query.status !== "all") {
    if (query.status === "duplicate") {
      const dupIds = await getDuplicateOrderIds(storeId);
      if (dupIds.size === 0) clauses.push("FALSE");
      else { values.push(Array.from(dupIds)); clauses.push(`b.id = ANY($${values.length})`); }
    } else {
      values.push(query.status);
      clauses.push(`b.status = $${values.length}`);
    }
  }

  if (query.source && query.source !== "all") {
    values.push(query.source);
    clauses.push(`b.computed_source = $${values.length}`);
  }

  if (query.delivery && query.delivery !== "all") {
    if (query.delivery === "not_shipped") clauses.push("b.shipment_status IS NULL");
    else { values.push(query.delivery); clauses.push(`b.shipment_status = $${values.length}`); }
  }

  if (query.carrier && query.carrier !== "all") {
    if (query.carrier === "none") clauses.push("b.shipment_carrier_connection_id IS NULL");
    else { values.push(query.carrier); clauses.push(`b.shipment_carrier_connection_id = $${values.length}`); }
  }

  if (query.agent && query.agent !== "all") {
    if (query.agent === "unassigned") clauses.push("b.assigned_agent_id IS NULL");
    else { values.push(query.agent); clauses.push(`b.assigned_agent_id = $${values.length}`); }
  }

  if (query.product && query.product !== "all") {
    const { rows } = await pool.query(`SELECT id, shopify_product_id FROM products WHERE id = $1 LIMIT 1`, [query.product]);
    const prod = rows[0];
    if (!prod) {
      clauses.push("FALSE");
    } else {
      values.push(prod.id);
      const idIdx = values.length;
      values.push(prod.shopify_product_id || "__none__");
      const shopIdx = values.length;
      clauses.push(`(
        EXISTS (SELECT 1 FROM order_items oi2 WHERE oi2.order_id = b.id AND oi2.product_id = $${idIdx})
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(b.items, '[]'::jsonb)) elem WHERE (elem->>'product_id') = $${shopIdx})
      )`);
    }
  }

  if (query.dateFrom) {
    values.push(query.dateFrom);
    clauses.push(`b.created_at >= $${values.length}`);
  }
  if (query.dateTo) {
    values.push(query.dateTo);
    clauses.push(`b.created_at <= $${values.length}`);
  }

  return { whereSQL: clauses.length ? clauses.join(" AND ") : "TRUE", values };
}
