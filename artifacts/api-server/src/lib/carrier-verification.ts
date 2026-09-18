import { pool } from "@workspace/db";
import { ensureCarrierTables } from "./schema-bootstrap.js";
import { createCarrierAdapter } from "./carriers/index.js";
import { decryptCredentials } from "./credentials-crypto.js";
import type { CarrierVerificationResult } from "./carriers/types.js";

// ─── Carrier connection verification ───────────────────────────────────────────
// Runs a single read-only probe (adapter.verifyConnection(), optional — see
// carriers/types.ts) using the merchant's own stored credentials, and records
// the result in carrier_connection_verifications: one row per connection,
// latest attempt only, replaced wholesale on every run (same decision as the
// geo cache in carrier-geo-cache.ts).
//
// Never mutates carrier-side state — verifyConnection() implementations are
// required to be read-only probes, never a parcel creation. Never persists a
// credential value: every string value from the decrypted credentials object
// is scrubbed out of the stored message/carrier error code before the INSERT,
// as a second line of defense on top of each adapter composing its own
// messages rather than echoing raw response bodies.

function scrubSecrets(text: string | null | undefined, secrets: string[]): string | null {
  if (text == null) return null;
  let out = text;
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

async function persistVerification(
  connectionId: string,
  carrier: string,
  result: CarrierVerificationResult,
  secrets: string[]
) {
  const message = scrubSecrets(result.message, secrets);
  const carrierErrorCode = scrubSecrets(result.carrierErrorCode, secrets);
  const { rows } = await pool.query(
    `INSERT INTO carrier_connection_verifications
       (carrier_connection_id, carrier, status, checked_at, probe_path, http_status, carrier_error_code, message, failure_reason, latency_ms, updated_at)
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (carrier_connection_id) DO UPDATE SET
       carrier = EXCLUDED.carrier,
       status = EXCLUDED.status,
       checked_at = NOW(),
       probe_path = EXCLUDED.probe_path,
       http_status = EXCLUDED.http_status,
       carrier_error_code = EXCLUDED.carrier_error_code,
       message = EXCLUDED.message,
       failure_reason = EXCLUDED.failure_reason,
       latency_ms = EXCLUDED.latency_ms,
       updated_at = NOW()
     RETURNING *`,
    [
      connectionId,
      carrier,
      result.status,
      result.probePath || null,
      result.httpStatus,
      carrierErrorCode,
      message,
      result.failureReason ?? null,
      result.latencyMs,
    ]
  );
  return rows[0];
}

// Runs the probe (if the carrier has one) and persists the result. Returns
// the persisted row, or null if the connection doesn't exist. Never throws
// past this boundary — every failure mode (bad credentials blob, unknown
// carrier, no adapter, probe threw) becomes a stored "unverified" result
// instead, so callers (connect flow, the re-verify endpoint) don't need their
// own fallback handling.
export async function verifyCarrierConnection(connectionId: string) {
  await ensureCarrierTables();

  const { rows } = await pool.query(
    `SELECT id, carrier, credentials FROM carrier_connections WHERE id = $1 LIMIT 1`,
    [connectionId]
  );
  const connection = rows[0];
  if (!connection) return null;

  let credentials: Record<string, string> = {};
  try {
    credentials = connection.credentials ? decryptCredentials(connection.credentials) : {};
  } catch {
    return persistVerification(
      connectionId,
      connection.carrier,
      {
        status: "unverified",
        probePath: "",
        httpStatus: null,
        carrierErrorCode: null,
        message: "Couldn't decrypt this connection's stored credentials for verification.",
        failureReason: "unknown_error",
        latencyMs: 0,
      },
      []
    );
  }
  // Every credential value, whatever the field is called for this carrier
  // (token, apiToken, secretKey, tenantId, guid, ...) — scrubbed from
  // whatever gets stored, regardless of which adapter produced the message.
  const secrets = Object.values(credentials).filter((v): v is string => typeof v === "string" && v.length > 0);

  let adapter;
  try {
    adapter = createCarrierAdapter(connection.carrier, credentials);
  } catch {
    return persistVerification(
      connectionId,
      connection.carrier,
      {
        status: "unverified",
        probePath: "",
        httpStatus: null,
        carrierErrorCode: null,
        message: "No adapter exists for this carrier — verification isn't available.",
        latencyMs: 0,
      },
      secrets
    );
  }

  if (!adapter.verifyConnection) {
    return persistVerification(
      connectionId,
      connection.carrier,
      {
        status: "unverified",
        probePath: "",
        httpStatus: null,
        carrierErrorCode: null,
        message: "This carrier's integration isn't live yet — connection verification isn't available.",
        latencyMs: 0,
      },
      secrets
    );
  }

  let result: CarrierVerificationResult;
  try {
    result = await adapter.verifyConnection();
  } catch (err: any) {
    result = {
      status: "unverified",
      probePath: "",
      httpStatus: null,
      carrierErrorCode: null,
      message: `Verification probe threw unexpectedly: ${err?.message || String(err)}`,
      failureReason: "unknown_error",
      latencyMs: 0,
    };
  }

  return persistVerification(connectionId, connection.carrier, result, secrets);
}

export async function getCarrierVerification(connectionId: string) {
  await ensureCarrierTables();
  const { rows } = await pool.query(
    `SELECT * FROM carrier_connection_verifications WHERE carrier_connection_id = $1 LIMIT 1`,
    [connectionId]
  );
  return rows[0] ?? null;
}
