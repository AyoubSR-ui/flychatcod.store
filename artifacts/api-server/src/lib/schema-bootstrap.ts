import { pool } from "@workspace/db";

// ─── Lazy, idempotent schema bootstrap ────────────────────────────────────────
// This codebase ships incremental schema changes via runtime ALTER/CREATE
// statements (see billing.ts, shopify.ts) rather than running drizzle-kit push
// against production. Each ensure* function below is cached after first success
// so it only hits the DB once per process lifetime.

let orderStatusValuesReady = false;
export async function ensureOrderStatusValues(): Promise<void> {
  if (orderStatusValuesReady) return;
  const newValues = ["self_confirmation", "self_confirmed", "no_answer", "callback"];
  for (const value of newValues) {
    await pool.query(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS '${value}'`);
  }
  orderStatusValuesReady = true;
}

let ordersAgentColumnReady = false;
export async function ensureOrdersAgentColumn(): Promise<void> {
  if (ordersAgentColumnReady) return;
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_agent_id TEXT`);
  ordersAgentColumnReady = true;
}

// Mirrors conversations.is_archived (see lib/db/src/schema/conversations.ts) —
// same boolean-flag, hidden-by-default pattern, now for orders. See
// order-filters.ts's buildOrderFilters, which always adds an is_archived
// clause (defaulting to false) so archived orders never leak into the
// normal list/KPIs by accident.
let ordersArchivedColumnReady = false;
export async function ensureOrdersArchivedColumn(): Promise<void> {
  if (ordersArchivedColumnReady) return;
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`CREATE INDEX IF NOT EXISTS orders_is_archived_idx ON orders (store_id, is_archived)`);
  ordersArchivedColumnReady = true;
}

let dispatchColumnsReady = false;
export async function ensureDispatchColumns(): Promise<void> {
  if (dispatchColumnsReady) return;
  await pool.query(`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS dispatch_quota INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE team_members ADD COLUMN IF NOT EXISTS dispatch_active BOOLEAN NOT NULL DEFAULT true`);
  // {enabled, inactiveAgentRule: "none"|"transfer"|"redistribute", transferToAgentIds: string[]}
  // NULL until an owner ever opens Team → Order Dispatch — see getAutoDispatchConfig
  // in lib/order-dispatch.ts for the default applied when it's still NULL.
  await pool.query(`ALTER TABLE stores ADD COLUMN IF NOT EXISTS auto_dispatch JSONB`);
  dispatchColumnsReady = true;
}

let profilePicColumnsReady = false;
export async function ensureProfilePicColumns(): Promise<void> {
  if (profilePicColumnsReady) return;
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS profile_pic TEXT`);
  await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_profile_pic TEXT`);
  profilePicColumnsReady = true;
}

let orderEventsTableReady = false;
export async function ensureOrderEventsTable(): Promise<void> {
  if (orderEventsTableReady) return;
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE order_event_type AS ENUM ('status_change', 'parcel_created', 'label_created', 'note_added');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_events (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      event_type order_event_type NOT NULL,
      from_status TEXT,
      to_status TEXT,
      description TEXT,
      created_by TEXT NOT NULL DEFAULT 'System',
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS order_events_order_id_idx ON order_events (order_id)`);
  orderEventsTableReady = true;
}

let customerLeadColumnsReady = false;
export async function ensureCustomerLeadColumns(): Promise<void> {
  if (customerLeadColumnsReady) return;

  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'interested'`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS meta_id TEXT`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS channel TEXT`);

  // One-time backfill from conversations. Real lead_stage values (verified
  // against lib/lead-intent.ts and conversations.channel's enum) are
  // 'interested' | 'engaged' | 'qualified_lead' | 'order_confirmed' — NOT
  // 'engaged'/'qualified'/'confirmed' as a naive guess might assume.
  await pool.query(`
    UPDATE customers c SET lead_stage = sub.best_stage
    FROM (
      SELECT customer_id,
        CASE MAX(
          CASE lead_stage
            WHEN 'order_confirmed' THEN 4
            WHEN 'qualified_lead' THEN 3
            WHEN 'engaged' THEN 2
            ELSE 1
          END
        )
          WHEN 4 THEN 'order_confirmed'
          WHEN 3 THEN 'qualified_lead'
          WHEN 2 THEN 'engaged'
          ELSE 'interested'
        END AS best_stage
      FROM conversations
      WHERE customer_id IS NOT NULL
      GROUP BY customer_id
    ) sub
    WHERE sub.customer_id = c.id AND (c.lead_stage IS NULL OR c.lead_stage = 'interested')
  `);

  // channel: most recent conversation's channel. Runs before meta_id since
  // meta_id backfill below depends on channel already being set.
  await pool.query(`
    UPDATE customers c SET channel = sub.channel
    FROM (
      SELECT DISTINCT ON (customer_id) customer_id, channel::text AS channel
      FROM conversations
      WHERE customer_id IS NOT NULL
      ORDER BY customer_id, created_at DESC
    ) sub
    WHERE sub.customer_id = c.id AND c.channel IS NULL
  `);

  // meta_id: conversations has no external_id column (verified — it doesn't
  // exist) — the real PSID/IGSID is stored directly in customers.phone for
  // Messenger/Instagram customers (see messenger.ts/instagram.ts, which look
  // customers up by eq(customersTable.phone, incoming.senderId)).
  await pool.query(`
    UPDATE customers SET meta_id = phone
    WHERE meta_id IS NULL AND channel IN ('messenger', 'instagram') AND phone IS NOT NULL AND phone != ''
  `);

  customerLeadColumnsReady = true;
}

let scheduledParcelsReady = false;
export async function ensureScheduledParcelsTable(): Promise<void> {
  if (scheduledParcelsReady) return;

  // order_events must exist first — order_event_type is only ALTERable once created.
  await ensureOrderEventsTable();

  await pool.query(`ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'scheduled'`);
  await pool.query(`ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'parcel_scheduled'`);
  await pool.query(`ALTER TYPE order_event_type ADD VALUE IF NOT EXISTS 'schedule_cancelled'`);

  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_ship_date TIMESTAMP`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS schedule_note TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_parcels (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      carrier_connection_id TEXT NOT NULL,
      scheduled_date TIMESTAMP NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      executed_at TIMESTAMP,
      result JSONB
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS scheduled_parcels_due_idx ON scheduled_parcels (status, scheduled_date)`);

  scheduledParcelsReady = true;
}

let carrierTablesReady = false;
export async function ensureCarrierTables(): Promise<void> {
  if (carrierTablesReady) return;

  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE carrier_status AS ENUM ('connected', 'error', 'disconnected');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE shipment_status AS ENUM (
        'not_shipped', 'label_created', 'label_purchased', 'label_printed',
        'confirmed', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'cancelled'
      );
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS carrier_connections (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      carrier TEXT NOT NULL,
      label TEXT NOT NULL,
      status carrier_status NOT NULL DEFAULT 'connected',
      credentials TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  // Migrate from the original JSONB column (no real credentials were ever
  // stored under it — nothing but "coming soon" carriers existed until now)
  // to TEXT holding an AES-256-GCM encrypted blob. No-op if already TEXT.
  await pool.query(`ALTER TABLE carrier_connections ALTER COLUMN credentials TYPE TEXT USING credentials::text`);
  await pool.query(`ALTER TABLE carrier_connections ALTER COLUMN credentials SET DEFAULT ''`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      carrier_connection_id TEXT NOT NULL,
      carrier TEXT NOT NULL,
      tracking_number TEXT,
      status shipment_status NOT NULL DEFAULT 'not_shipped',
      label_url TEXT,
      raw_response JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS shipments_order_id_idx ON shipments (order_id)`);

  // Per-connection cache of communes (+ stop-desk flag), desks, and fees
  // fetched straight from the carrier's own API — see lib/carrier-geo-cache.ts.
  // One row per connection, replaced wholesale on every successful refresh.
  // No FK to carrier_connections (this schema declares none anywhere — see
  // wipe-store-orders.cjs) so a deleted connection just leaves an orphaned
  // cache row rather than failing; harmless, and cleaned up incidentally the
  // next time this table is queried for a connection that no longer exists.
  // fetched_at is only set on a successful fetch; last_attempted_at/last_error
  // track the most recent attempt (success or not) so a stale cache from a
  // currently-failing carrier is still visible and still served — never wiped
  // by a failed refresh.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS carrier_connection_geo_cache (
      carrier_connection_id TEXT PRIMARY KEY,
      carrier TEXT NOT NULL,
      communes JSONB NOT NULL DEFAULT '[]',
      desks JSONB NOT NULL DEFAULT '[]',
      fees JSONB NOT NULL DEFAULT '[]',
      fetched_at TIMESTAMP,
      last_attempted_at TIMESTAMP,
      last_error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // One read-only credential-verification probe result per connection (see
  // lib/carrier-verification.ts) — latest attempt only, replaced wholesale on
  // every (re-)run, same shape of decision as the geo cache above. Never
  // holds the token or an auth header — see CarrierVerificationResult's own
  // contract in carriers/types.ts. failure_reason is plain TEXT rather than
  // an enum: the known reasons cover today's single live probe (Ecotrack),
  // but a future adapter's probe may need a category this doesn't have yet,
  // and that shouldn't require a migration to add.
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE carrier_verification_status AS ENUM ('verified', 'failed', 'unverified');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS carrier_connection_verifications (
      carrier_connection_id TEXT PRIMARY KEY,
      carrier TEXT NOT NULL,
      status carrier_verification_status NOT NULL,
      checked_at TIMESTAMP NOT NULL DEFAULT NOW(),
      probe_path TEXT,
      http_status INTEGER,
      carrier_error_code TEXT,
      message TEXT,
      failure_reason TEXT,
      latency_ms INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  carrierTablesReady = true;
}
