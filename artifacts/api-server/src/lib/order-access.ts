import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

// An agent's own team_members.id — the thing orders.assigned_agent_id is
// compared against everywhere agent scoping applies. Not exposed via
// GET /team/members (owner-only) — an agent's session resolves its own id
// server-side instead, so scoping never depends on the client sending it.
export async function getAgentTeamMemberId(userId: string, storeId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id FROM team_members WHERE user_id = $1 AND store_id = $2 AND status != 'removed' LIMIT 1`,
    [userId, storeId]
  );
  return rows[0]?.id ?? null;
}

// Mounted after requireAuth on every /:id order route. Owner/admin pass
// through unchanged. An agent gets 404 if the order isn't in their store at
// all (same as today), and 403 if it exists but isn't assigned to them —
// including an unassigned order, which is deliberately NOT a pass: "agents
// see only orders assigned to them" means unassigned ones too, not just
// other agents'.
export async function requireOrderAccess(req: Request, res: Response, next: NextFunction) {
  const storeId = req.user!.storeId;
  const { rows } = await pool.query(
    `SELECT assigned_agent_id FROM orders WHERE id = $1 AND store_id = $2 LIMIT 1`,
    [req.params.id, storeId]
  );
  if (!rows[0]) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }

  if (req.user!.role === "agent") {
    const ownId = await getAgentTeamMemberId(req.user!.id, String(storeId));
    if (!ownId || rows[0].assigned_agent_id !== ownId) {
      res.status(403).json({ error: "forbidden", message: "You can only access orders assigned to you." });
      return;
    }
  }
  next();
}
