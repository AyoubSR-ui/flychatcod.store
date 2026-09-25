import { pgTable, text, boolean, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "agent", "superadmin"]);
export const languageEnum = pgEnum("language", ["en", "fr"]);

// email is intentionally NOT unique on its own — a person can hold one
// account per store (their own store as owner, plus one per store they've
// been invited into as admin/agent), each with its own password. Login
// matches email+password across all of them (see routes/auth.ts). The old
// global-unique constraint was dropped in scripts/src/migrate-accounts-and-reset.ts;
// uniqueness is now per (email, store_id) instead — see the users_email_store_id_idx
// below and scripts/src/migrate-account-lifecycle.ts, which cleans up
// pre-existing duplicates before that index can be created.
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("owner"),
  language: languageEnum("language").notNull().default("en"),
  organizationId: text("organization_id"),
  storeId: text("store_id"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("users_email_idx").on(table.email),
  uniqueIndex("users_email_store_id_idx").on(table.email, table.storeId),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
