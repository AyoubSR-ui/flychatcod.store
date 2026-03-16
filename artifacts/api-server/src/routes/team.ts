import { Router } from "express";
import { db, teamMembersTable, inviteTokensTable, storesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { generateId } from "../lib/id.js";
import { sendInviteEmail } from "../lib/email.js";
import { randomBytes } from "crypto";

const router = Router();

function buildAcceptUrl(req: any, token: string): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}/accept-invite?token=${token}`;
}

router.get("/members", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ members: [] }); return; }
    const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.storeId, storeId));
    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch team members" });
  }
});

router.post("/members", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store", message: "Complete onboarding first" }); return; }

    const { email, role } = req.body;
    if (!email || !role) { res.status(400).json({ error: "validation_error", message: "email and role are required" }); return; }

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

    const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    const storeName = store?.name || "Your Store";
    const inviterName = req.user!.name || req.user!.email;
    const acceptUrl = buildAcceptUrl(req, token);

    const inviteSent = await sendInviteEmail({ to: email, storeName, inviterName, role: role as string, acceptUrl });

    res.status(201).json({ ...member, inviteSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to invite team member" });
  }
});

router.post("/members/:id/resend-invite", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const [member] = await db.select().from(teamMembersTable)
      .where(and(eq(teamMembersTable.id, req.params.id), eq(teamMembersTable.storeId, storeId)))
      .limit(1);

    if (!member) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    if (member.status !== "invited") { res.status(400).json({ error: "already_active", message: "This member is already active" }); return; }

    await db.update(inviteTokensTable)
      .set({ usedAt: new Date() })
      .where(and(
        eq(inviteTokensTable.teamMemberId, member.id),
        eq(inviteTokensTable.storeId, storeId),
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

    const [store] = await db.select({ name: storesTable.name }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
    const storeName = store?.name || "Your Store";
    const inviterName = req.user!.name || req.user!.email;
    const acceptUrl = buildAcceptUrl(req, token);

    const inviteSent = await sendInviteEmail({ to: member.email, storeName, inviterName, role: member.role, acceptUrl });

    res.json({ success: true, inviteSent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to resend invite" });
  }
});

router.patch("/members/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    const { role, status } = req.body;
    const updates: Partial<typeof teamMembersTable.$inferSelect> = { updatedAt: new Date() };
    if (role) updates.role = role;
    if (status) updates.status = status;

    const [updated] = await db.update(teamMembersTable).set(updates)
      .where(and(eq(teamMembersTable.id, req.params.id), eq(teamMembersTable.storeId, storeId!)))
      .returning();

    if (!updated) { res.status(404).json({ error: "not_found", message: "Team member not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update team member" });
  }
});

router.delete("/members/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    await db.delete(inviteTokensTable).where(and(eq(inviteTokensTable.teamMemberId, req.params.id), eq(inviteTokensTable.storeId, storeId!)));
    await db.delete(teamMembersTable).where(and(eq(teamMembersTable.id, req.params.id), eq(teamMembersTable.storeId, storeId!)));
    res.json({ success: true, message: "Team member removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to remove team member" });
  }
});

export default router;
