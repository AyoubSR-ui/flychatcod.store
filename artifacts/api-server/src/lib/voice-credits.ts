import { pool } from "@workspace/db";

export interface VoiceStatus {
  eligible: boolean;
  callsIncluded: number;
  callsExtra: number;
  callsUsed: number;
  callsRemaining: number;
  statusLabel: "active" | "low_credits" | "paused" | "not_included";
  callerPhone: string | null;
  resetAt: Date | null;
}

const PLAN_VOICE_CALLS: Record<string, number> = {
  free: 0,
  starter: 50,
  pro: 150,
  agency: 500,
};

export async function getVoiceStatus(storeId: string): Promise<VoiceStatus> {
  try {
    const { rows } = await pool.query(
      `SELECT 
        s.plan,
        s.voice_calls_included,
        s.voice_calls_extra,
        s.voice_calls_used,
        s.voice_calls_reset_at,
        s.current_period_end,
        st.voice_caller_phone
       FROM subscriptions s
       JOIN stores st ON st.organization_id = s.organization_id
       WHERE st.id = $1 LIMIT 1`,
      [storeId]
    );

    if (!rows[0]) {
      return { eligible: false, callsIncluded: 0, callsExtra: 0, callsUsed: 0, callsRemaining: 0, statusLabel: "not_included", callerPhone: null, resetAt: null };
    }

    const row = rows[0];
    const planCalls = PLAN_VOICE_CALLS[row.plan] ?? 0;
    const included = Math.max(row.voice_calls_included || 0, planCalls);
    const extra = row.voice_calls_extra || 0;
    const used = row.voice_calls_used || 0;
    const total = included + extra;
    const remaining = Math.max(0, total - used);

    if (total === 0) return { eligible: false, callsIncluded: included, callsExtra: extra, callsUsed: used, callsRemaining: 0, statusLabel: "not_included", callerPhone: row.voice_caller_phone, resetAt: row.voice_calls_reset_at };
    if (remaining <= 0) return { eligible: false, callsIncluded: included, callsExtra: extra, callsUsed: used, callsRemaining: 0, statusLabel: "paused", callerPhone: row.voice_caller_phone, resetAt: row.voice_calls_reset_at };

    const low = total * 0.1;
    const statusLabel = remaining <= low ? "low_credits" : "active";

    return { eligible: !!row.voice_caller_phone, callsIncluded: included, callsExtra: extra, callsUsed: used, callsRemaining: remaining, statusLabel, callerPhone: row.voice_caller_phone, resetAt: row.voice_calls_reset_at };
  } catch (err) {
    console.error("[Voice Credits] getVoiceStatus error:", err);
    return { eligible: false, callsIncluded: 0, callsExtra: 0, callsUsed: 0, callsRemaining: 0, statusLabel: "not_included", callerPhone: null, resetAt: null };
  }
}

export async function consumeVoiceCall(storeId: string): Promise<void> {
  await pool.query(
    `UPDATE subscriptions s
     SET voice_calls_used = voice_calls_used + 1, updated_at = NOW()
     FROM stores st
     WHERE st.organization_id = s.organization_id AND st.id = $1`,
    [storeId]
  );
}

export async function saveCallerPhone(storeId: string, phone: string): Promise<void> {
  await pool.query(
    `UPDATE stores SET voice_caller_phone = $1 WHERE id = $2`,
    [phone, storeId]
  );
}

export async function getCallerPhone(storeId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT voice_caller_phone FROM stores WHERE id = $1 LIMIT 1`,
    [storeId]
  );
  return rows[0]?.voice_caller_phone || null;
}