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

  carrierTablesReady = true;
}
