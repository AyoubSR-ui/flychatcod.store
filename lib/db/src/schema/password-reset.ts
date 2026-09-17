import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// tokenHash is sha256(plaintext token) — the plaintext only ever exists in
// the reset email link, never stored. userId (not email) is the point of
// this table: since a single email can now own several accounts (see
// users.ts), a reset token is always scoped to one specific account/store.
export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("password_reset_tokens_user_id_idx").on(table.userId),
]);

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokensTable).omit({ createdAt: true });
export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
