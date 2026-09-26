import { pgTable, text, timestamp, pgEnum, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamRoleEnum = pgEnum("team_role", ["owner", "admin", "agent"]);
// "removed" is distinct from "inactive" (a manual pause an owner can toggle
// back on): a removed member's users row is hard-deleted and the row itself
// is terminal — kept only so past orders (orders.assigned_agent_id) and the
// performance dashboard still resolve a name, never re-activated in place.
// Re-inviting the same email creates a fresh team_members row instead.
export const teamStatusEnum = pgEnum("team_status", ["active", "invited", "inactive", "removed"]);

export const teamMembersTable = pgTable("team_members", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  storeId: text("store_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  role: teamRoleEnum("role").notNull().default("agent"),
  status: teamStatusEnum("status").notNull().default("invited"),
  // Auto-dispatch (see lib/order-dispatch.ts): quota is this agent's relative
  // share weight, not a hard cap — 0 means "never picked by auto-dispatch"
  // (matches the plain invite default, before an owner has configured
  // dispatch at all). dispatchActive is the per-agent on/off toggle ("off
  // shift") — distinct from status, which is about team membership, not
  // dispatch eligibility.
  dispatchQuota: integer("dispatch_quota").notNull().default(0),
  dispatchActive: boolean("dispatch_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const inviteTokensTable = pgTable("invite_tokens", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  storeId: text("store_id").notNull(),
  teamMemberId: text("team_member_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTeamMemberSchema = createInsertSchema(teamMembersTable).omit({ createdAt: true, updatedAt: true });
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;
export type TeamMember = typeof teamMembersTable.$inferSelect;
