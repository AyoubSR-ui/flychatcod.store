import { Router } from "express";
import { db, pool, teamMembersTable, inviteTokensTable, storesTable, usersTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { requireOwner } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { sendInviteEmail } from "../lib/email.js";
import { randomBytes } from "crypto";
import {
  getAutoDispatchConfig, setAutoDispatchConfig, getAllDispatchAgents,
  dispatchNow, applyInactiveAgentRule, getUnassignedEligibleCount,
} from "../lib/order-dispatch.js";

const router = Router();

const PLAN_LIMITS: Record<string, number> = { free: 1, starter: 3, pro: 10, agency: -1 };

// Team management is owner-only end to end (see requireOwner on every route
// below) — but the role-assignment checks here are kept as their own,
// independent guard rather than trusting the middleware alone. If this ever
// gets loosened to admins too (not the current decision), these rules —
// never grant "owner", never grant a role you don't outrank — still hold
// without anyone having to remember to add them back in.
const ROLE_RANK: Record<string, number> = { owner: 3, admin: 2, agent: 1 };

function isAssignableRole(requestedRole: unknown, callerRole: string): requestedRole is "admin" | "agent" {
  if (requestedRole !== "admin" && requestedRole !== "agent") return false;
  return ROLE_RANK[requestedRole] < (ROLE_RANK[callerRole] ?? 0);
}

function buildAcceptUrl(token: string): string {
  const configured = process.env.APP_BASE_URL
    || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  const base = configured || "http://localhost:5173";
  return `${base}/accept-invite?token=${token}`;
}

async function getPlanForStore(storeId: string): Promise<string> {
  const { rows } = await pool.query(
    `SELECT s.plan FROM subscriptions s JOIN stores st ON st.organization_id = s.organization_id WHERE st.id = $1 LIMIT 1`,
    [storeId]
  );
  return rows[0]?.plan ?? "free";
}

// ─── GET members ──────────────────────────────────────────────────────────────
router.get("/members", requireOwner, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ members: [] }); return; }
    // "removed" rows are kept for order history / the performance dashboard
    // (see DELETE /members/:id) but must never appear as active roster.
    const members = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.storeId, String(storeId)), ne(teamMembersTable.status, "removed")));
    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch team members" });
  }
});

// ─── POST invite member ───────────────────────────────────────────────────────
router.post("/members", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { email, role } = req.body;
    if (!email || !role) {
      res.status(400).json({ error: "validation_error", message: "email and role are required" });
      return;
    }
    if (!isAssignableRole(role, req.user!.role)) {
      res.status(400).json({ error: "invalid_role", message: "role must be \"admin\" or \"agent\" — you can't invite someone as owner." });
      return;
    }

    // Plan limit check
    const plan = await getPlanForStore(storeId);
    const limit = PLAN_LIMITS[plan] ?? 1;
    if (limit !== -1) {
      const currentMembers = await db.select().from(teamMembersTable)
        .where(and(eq(teamMembersTable.storeId, String(storeId)), ne(teamMembersTable.status, "removed")));
      if (currentMembers.length >= limit) {
        res.status(403).json({
          error: "plan_limit_reached",
          message: `Your ${plan} plan allows up to ${limit} team member${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        });
        return;
      }
    }

    const teamMemberId = generateId("tm");
    const [member] = await db.insert(teamMembersTable).values({
      id: teamMemberId,
      storeId,
      email,
      role: role as "owner" | "admin" | "agent",
      status: "invited",
    }).returning();

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(inviteTokensTable).values({
      id: generateId("itk"),
      token,
      storeId,
      teamMemberId,
      email,
      role: role as string,
      expiresAt,
    });

    const [store] = await db.select({ name: storesTable.name })
      .from(storesTable).where(eq(storesTable.id, String(storeId))).limit(1);
    const storeName = store?.name || "Your Store";
    const inviterName = req.user!.name || req.user!.email;
    const acceptUrl = buildAcceptUrl(token);

    const inviteSent = await sendInviteEmail({ to: email, storeName, inviterName, role: role as string, acceptUrl });

    res.status(201).json({ ...member, inviteSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to invite team member" });
  }
});

// ─── POST resend invite ───────────────────────────────────────────────────────
router.post("/members/:id/resend-invite", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const [member] = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, String(req.params.id)), eq(teamMembersTable.storeId, String(storeId))))
      .limit(1);

    if (!member) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    if (member.status !== "invited") {
      res.status(400).json({ error: "already_active", message: "This member is already active" });
      return;
    }

    // Invalidate old tokens
    await db.update(inviteTokensTable)
      .set({ usedAt: new Date() })
      .where(and(
        eq(inviteTokensTable.teamMemberId, member.id),
        eq(inviteTokensTable.storeId, String(storeId)),
      ));

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(inviteTokensTable).values({
      id: generateId("itk"),
      token,
      storeId,
      teamMemberId: member.id,
      email: member.email,
      role: member.role,
      expiresAt,
    });

    const [store] = await db.select({ name: storesTable.name })
      .from(storesTable).where(eq(storesTable.id, String(storeId))).limit(1);
    const storeName = store?.name || "Your Store";
    const inviterName = req.user!.name || req.user!.email;
    const acceptUrl = buildAcceptUrl(token);

    const inviteSent = await sendInviteEmail({
      to: member.email, storeName, inviterName, role: member.role, acceptUrl,
    });

    res.json({ success: true, inviteSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to resend invite" });
  }
});

// ─── PATCH member ─────────────────────────────────────────────────────────────
router.patch("/members/:id", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);
    const { role, status } = req.body;
    if (role && !isAssignableRole(role, req.user!.role)) {
      res.status(400).json({ error: "invalid_role", message: "role must be \"admin\" or \"agent\" — you can't promote someone to owner." });
      return;
    }
    // "removed" is terminal and paired with hard-deleting the login — only
    // DELETE /members/:id can set it; going through here would leave the
    // users row alive under a status this route never expects to see.
    if (status === "removed") {
      res.status(400).json({ error: "invalid_status", message: "Use DELETE to remove a team member." });
      return;
    }

    const [existing] = await db.select({ status: teamMembersTable.status }).from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, String(req.params.id)), eq(teamMembersTable.storeId, storeId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    // Removed rows are terminal (their login is gone) — re-invite the email
    // instead of trying to revive this row in place.
    if (existing.status === "removed") {
      res.status(410).json({ error: "removed", message: "This team member was removed. Invite them again instead." });
      return;
    }

    const updates: Partial<typeof teamMembersTable.$inferSelect> = { updatedAt: new Date() };
    if (role) updates.role = role;
    if (status) updates.status = status;

    const [updated] = await db.update(teamMembersTable).set(updates)
      .where(and(eq(teamMembersTable.id, String(req.params.id)), eq(teamMembersTable.storeId, String(storeId))))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update team member" });
  }
});

// ─── DELETE member ────────────────────────────────────────────────────────────
router.delete("/members/:id", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);

    const [member] = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, String(req.params.id)), eq(teamMembersTable.storeId, storeId)))
      .limit(1);
    if (!member) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    if (member.role === "owner") {
      res.status(403).json({ error: "cannot_remove_owner", message: "The store owner can't be removed from the team." });
      return;
    }

    await db.delete(inviteTokensTable)
      .where(and(
        eq(inviteTokensTable.teamMemberId, String(req.params.id)),
        eq(inviteTokensTable.storeId, String(storeId))
      ));

    // Hard-delete the login (its existence is what accept-invite checks to
    // decide reuse vs. insert — see POST /accept-invite), but keep the
    // team_members row itself, marked removed, so past orders
    // (orders.assigned_agent_id) and the performance dashboard still
    // resolve an agent name. A re-invite of this email creates a fresh
    // team_members row rather than reviving this one.
    if (member.userId) {
      await db.delete(usersTable)
        .where(and(eq(usersTable.id, member.userId), eq(usersTable.storeId, storeId)));
    }
    await db.update(teamMembersTable)
      .set({ status: "removed", updatedAt: new Date() })
      .where(and(
        eq(teamMembersTable.id, String(req.params.id)),
        eq(teamMembersTable.storeId, String(storeId))
      ));

    await applyInactiveAgentRule(storeId, String(req.params.id)).catch(err => console.error("[Team] Inactive-agent rule error:", err));

    res.json({ success: true, message: "Team member removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to remove team member" });
  }
});

// ─── PATCH member's dispatch settings (quota + on/off) ─────────────────────────
router.patch("/members/:id/dispatch", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);
    const { quota, active } = req.body as { quota?: number; active?: boolean };

    if (quota !== undefined && (!Number.isInteger(quota) || quota < 0)) {
      res.status(400).json({ error: "validation_error", message: "quota must be a non-negative integer" });
      return;
    }

    const [existing] = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, String(req.params.id)), eq(teamMembersTable.storeId, storeId)))
      .limit(1);
    if (!existing) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    if (existing.status === "removed") { res.status(410).json({ error: "removed", message: "This team member was removed." }); return; }

    const updates: Partial<typeof teamMembersTable.$inferSelect> = { updatedAt: new Date() };
    if (quota !== undefined) updates.dispatchQuota = quota;
    if (active !== undefined) updates.dispatchActive = active;

    const [updated] = await db.update(teamMembersTable).set(updates)
      .where(and(eq(teamMembersTable.id, String(req.params.id)), eq(teamMembersTable.storeId, storeId)))
      .returning();

    // Only the true → false transition matters here — turning an agent back
    // on never needs to move anything, they just start receiving new orders
    // again.
    if (active === false && existing.dispatchActive !== false) {
      await applyInactiveAgentRule(storeId, String(req.params.id)).catch(err => console.error("[Team] Inactive-agent rule error:", err));
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update dispatch settings" });
  }
});

// ─── GET auto-dispatch config + candidate agents with computed share % ────────
router.get("/auto-dispatch", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);
    const config = await getAutoDispatchConfig(storeId);
    const allAgents = await getAllDispatchAgents(storeId);
    // Share % is computed only across agents currently eligible to receive
    // anything (toggled on, quota > 0) — an off agent's saved quota still
    // shows in the input, but their share reads 0, matching what would
    // actually happen if Dispatch Now ran right now.
    const eligible = allAgents.filter(a => a.active && a.quota > 0);
    const totalQuota = eligible.reduce((sum, a) => sum + a.quota, 0);
    const agents = allAgents.map(a => ({
      id: a.id, name: a.name, email: a.email, quota: a.quota, active: a.active,
      sharePercent: (a.active && a.quota > 0 && totalQuota > 0) ? Math.round((a.quota / totalQuota) * 1000) / 10 : 0,
    }));
    // What "Dispatch Now" would actually act on right now — new/confirmed
    // and still unassigned. Shown to the owner before they click it, not
    // after.
    const unassignedEligibleCount = await getUnassignedEligibleCount(storeId);
    res.json({ ...config, agents, unassignedEligibleCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch auto-dispatch settings" });
  }
});

// ─── PATCH auto-dispatch config (enabled / inactiveAgentRule / transferToAgentIds) ─
router.patch("/auto-dispatch", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);
    const { enabled, inactiveAgentRule, transferToAgentIds } = req.body as {
      enabled?: boolean; inactiveAgentRule?: "none" | "transfer" | "redistribute"; transferToAgentIds?: string[];
    };
    if (inactiveAgentRule && !["none", "transfer", "redistribute"].includes(inactiveAgentRule)) {
      res.status(400).json({ error: "validation_error", message: "inactiveAgentRule must be \"none\", \"transfer\", or \"redistribute\"" });
      return;
    }
    const updated = await setAutoDispatchConfig(storeId, {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(inactiveAgentRule !== undefined ? { inactiveAgentRule } : {}),
      ...(transferToAgentIds !== undefined ? { transferToAgentIds } : {}),
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update auto-dispatch settings" });
  }
});

// ─── POST /auto-dispatch/run — "Dispatch Now" ──────────────────────────────────
// Manual one-off sweep — distributes every currently-unassigned order by
// quota, regardless of whether the store's Auto Dispatch toggle is on.
// Reports exactly what happened rather than a bare success flag, since this
// touches a batch of orders the owner didn't individually pick.
router.post("/auto-dispatch/run", requireOwner, async (req, res) => {
  try {
    const storeId = String(req.user!.storeId);
    const result = await dispatchNow(storeId);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to run dispatch" });
  }
});

export default router;