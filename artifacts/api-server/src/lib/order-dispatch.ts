import { pool } from "@workspace/db";
import { ensureDispatchColumns } from "./schema-bootstrap.js";

export interface AutoDispatchConfig {
  enabled: boolean;
  inactiveAgentRule: "none" | "transfer" | "redistribute";
  transferToAgentIds: string[];
}

// OFF, no rule, no targets — matches the column's NULL default exactly, so
// an owner who's never opened Team → Order Dispatch sees the same behavior
// as before this feature existed: nothing is auto-assigned.
const DEFAULT_CONFIG: AutoDispatchConfig = { enabled: false, inactiveAgentRule: "none", transferToAgentIds: [] };

export async function getAutoDispatchConfig(storeId: string): Promise<AutoDispatchConfig> {
  await ensureDispatchColumns();
  const { rows } = await pool.query(`SELECT auto_dispatch FROM stores WHERE id = $1 LIMIT 1`, [storeId]);
  return { ...DEFAULT_CONFIG, ...(rows[0]?.auto_dispatch || {}) };
}

export async function setAutoDispatchConfig(storeId: string, patch: Partial<AutoDispatchConfig>): Promise<AutoDispatchConfig> {
  const next = { ...(await getAutoDispatchConfig(storeId)), ...patch };
  await pool.query(`UPDATE stores SET auto_dispatch = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(next), storeId]);
  return next;
}

// The only statuses auto-dispatch (both Dispatch Now and the automatic
// per-order path share this one list — never let the two drift apart) will
// ever touch:
//   - new                 — fresh, nobody's worked it yet
//   - awaiting_confirmation — a chat-captured order waiting for a human to
//     phone the customer; this is exactly the work an agent should be
//     handed, not something to leave unassigned until it's already confirmed
//   - confirmed           — needs to move forward (dispatch, follow-up)
// Everything else — cancelled, suspicious, shipped, callback, delivered,
// scheduled, etc. — is either already resolved or already has context with
// whoever's handling it; assigning it fresh to an agent via quota is noise,
// not work. A store can accumulate a large "unassigned" backlog before this
// feature ever existed, most of which isn't actually workable.
export const DISPATCHABLE_STATUSES = ["new", "awaiting_confirmation", "confirmed"];

export interface DispatchCandidate { id: string; name: string | null; email: string; quota: number }
export interface DispatchAgentSetting extends DispatchCandidate { active: boolean }

// Every agent auto-dispatch is actually allowed to pick from right now: an
// agent (not owner/admin — this feature distributes customer orders among
// support agents, not store management), not removed, toggled on, with a
// nonzero quota (0 opts an agent out just as surely as the toggle does — no
// need to juggle two different "off" states).
export async function getDispatchCandidates(storeId: string): Promise<DispatchCandidate[]> {
  await ensureDispatchColumns();
  const { rows } = await pool.query(
    `SELECT id, name, email, dispatch_quota FROM team_members
     WHERE store_id = $1 AND role = 'agent' AND status != 'removed' AND dispatch_active = true AND dispatch_quota > 0`,
    [storeId]
  );
  return rows.map((r: any) => ({ id: r.id, name: r.name, email: r.email, quota: Number(r.dispatch_quota) }));
}

// Every agent the Team → Order Dispatch screen can show/configure — every
// non-removed agent, regardless of their current quota/toggle state (unlike
// getDispatchCandidates above, which only lists who'd actually receive an
// order right now).
export async function getAllDispatchAgents(storeId: string): Promise<DispatchAgentSetting[]> {
  await ensureDispatchColumns();
  const { rows } = await pool.query(
    `SELECT id, name, email, dispatch_quota, dispatch_active FROM team_members
     WHERE store_id = $1 AND role = 'agent' AND status != 'removed'
     ORDER BY created_at ASC`,
    [storeId]
  );
  return rows.map((r: any) => ({ id: r.id, name: r.name, email: r.email, quota: Number(r.dispatch_quota), active: r.dispatch_active }));
}

// Count backing the confirmation step before "Dispatch Now" actually runs —
// the owner sees this number (not just "some orders") before committing.
export async function getUnassignedEligibleCount(storeId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM orders WHERE store_id = $1 AND assigned_agent_id IS NULL AND status = ANY($2)`,
    [storeId, DISPATCHABLE_STATUSES]
  );
  return Number(rows[0]?.cnt ?? 0);
}

async function getCurrentLoads(storeId: string, candidateIds: string[]): Promise<Map<string, number>> {
  const loads = new Map(candidateIds.map(id => [id, 0]));
  if (candidateIds.length === 0) return loads;
  const { rows } = await pool.query(
    `SELECT assigned_agent_id, COUNT(*) AS cnt FROM orders
     WHERE store_id = $1 AND assigned_agent_id = ANY($2) GROUP BY assigned_agent_id`,
    [storeId, candidateIds]
  );
  for (const r of rows as any[]) loads.set(r.assigned_agent_id, Number(r.cnt));
  return loads;
}

// Weighted-fair pick: whoever is currently furthest below their quota share
// (lowest current-load ÷ quota ratio) gets the next order. Self-correcting —
// no persistent counters to drift out of sync — and used identically for a
// single incoming order and for the Dispatch Now batch (which just calls
// this once per order, updating `loads` in memory as it goes).
function pickAgent(candidates: DispatchCandidate[], loads: Map<string, number>): string | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const ra = (loads.get(a.id) ?? 0) / a.quota;
    const rb = (loads.get(b.id) ?? 0) / b.quota;
    if (ra !== rb) return ra - rb;
    const la = loads.get(a.id) ?? 0, lb = loads.get(b.id) ?? 0;
    if (la !== lb) return la - lb;
    return a.id.localeCompare(b.id); // deterministic tie-break, not fetch order
  });
  return sorted[0].id;
}

// Called right after every order-creation site (manual POST /orders, the AI
// bridge, the create_order_flow automation action, and both Shopify
// insert paths) — a no-op unless the store has Auto Dispatch on. Never
// overrides an assignment the order already has (e.g. inherited from its
// conversation) — auto-dispatch only fills in orders that are still
// unassigned at the moment this runs.
export async function autoAssignIfEnabled(storeId: string, orderId: string): Promise<string | null> {
  const config = await getAutoDispatchConfig(storeId);
  if (!config.enabled) return null;

  const candidates = await getDispatchCandidates(storeId);
  if (candidates.length === 0) return null;

  const loads = await getCurrentLoads(storeId, candidates.map(c => c.id));
  const pick = pickAgent(candidates, loads);
  if (!pick) return null;

  const { rowCount } = await pool.query(
    `UPDATE orders SET assigned_agent_id = $1, updated_at = NOW()
     WHERE id = $2 AND store_id = $3 AND assigned_agent_id IS NULL AND status = ANY($4)`,
    [pick, orderId, storeId, DISPATCHABLE_STATUSES]
  );
  return rowCount ? pick : null;
}

export interface DispatchNowResult {
  assignedCount: number;
  byAgent: { agentId: string; name: string | null; email: string; count: number }[];
}

// The "Dispatch Now" button — distributes every currently-unassigned order
// in the store across active agents by quota. Runs regardless of the store's
// Auto Dispatch toggle (it's a manual one-off sweep, not the automatic
// per-order path) — the two share the exact same pickAgent() weighting so
// "Dispatch Now" and "as orders arrive" always mean the same thing.
export async function dispatchNow(storeId: string): Promise<DispatchNowResult> {
  const candidates = await getDispatchCandidates(storeId);
  if (candidates.length === 0) return { assignedCount: 0, byAgent: [] };

  const { rows: unassigned } = await pool.query(
    `SELECT id FROM orders WHERE store_id = $1 AND assigned_agent_id IS NULL AND status = ANY($2) ORDER BY created_at ASC`,
    [storeId, DISPATCHABLE_STATUSES]
  );
  if (unassigned.length === 0) return { assignedCount: 0, byAgent: [] };

  const loads = await getCurrentLoads(storeId, candidates.map(c => c.id));
  const byAgentCount = new Map<string, number>();

  for (const order of unassigned as any[]) {
    const pick = pickAgent(candidates, loads);
    if (!pick) break;
    await pool.query(`UPDATE orders SET assigned_agent_id = $1, updated_at = NOW() WHERE id = $2`, [pick, order.id]);
    loads.set(pick, (loads.get(pick) ?? 0) + 1);
    byAgentCount.set(pick, (byAgentCount.get(pick) ?? 0) + 1);
  }

  const byAgent = candidates
    .filter(c => byAgentCount.has(c.id))
    .map(c => ({ agentId: c.id, name: c.name, email: c.email, count: byAgentCount.get(c.id)! }));

  return { assignedCount: [...byAgentCount.values()].reduce((s, n) => s + n, 0), byAgent };
}

// Orders this status can't meaningfully hand off any further — nothing to
// redistribute once an order has already been delivered or cancelled.
const CLOSED_STATUSES = ["delivered", "cancelled"];

// Called when an agent stops being eligible for auto-dispatch — the toggle
// flipping off, or the agent being removed from the team. Only fires
// anything if the store has Auto Dispatch on AND a rule other than "none" —
// "none" is the safe default (leave their existing orders exactly where
// they are; they just stop receiving new ones).
export async function applyInactiveAgentRule(storeId: string, agentId: string): Promise<void> {
  const config = await getAutoDispatchConfig(storeId);
  if (!config.enabled || config.inactiveAgentRule === "none") return;

  const { rows: openOrders } = await pool.query(
    `SELECT id FROM orders WHERE store_id = $1 AND assigned_agent_id = $2 AND status != ALL($3)`,
    [storeId, agentId, CLOSED_STATUSES]
  );
  if (openOrders.length === 0) return;

  if (config.inactiveAgentRule === "transfer") {
    const targets = config.transferToAgentIds.filter(id => id !== agentId);
    if (targets.length === 0) return; // nothing configured — never guess a target
    let i = 0;
    for (const order of openOrders as any[]) {
      await pool.query(`UPDATE orders SET assigned_agent_id = $1, updated_at = NOW() WHERE id = $2`, [targets[i % targets.length], order.id]);
      i++;
    }
  } else if (config.inactiveAgentRule === "redistribute") {
    const candidates = (await getDispatchCandidates(storeId)).filter(c => c.id !== agentId);
    if (candidates.length === 0) return;
    const loads = await getCurrentLoads(storeId, candidates.map(c => c.id));
    for (const order of openOrders as any[]) {
      const pick = pickAgent(candidates, loads);
      if (!pick) break;
      await pool.query(`UPDATE orders SET assigned_agent_id = $1, updated_at = NOW() WHERE id = $2`, [pick, order.id]);
      loads.set(pick, (loads.get(pick) ?? 0) + 1);
    }
  }
}
