import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// A Shopify install that completed OAuth (has a real access token) before we
// knew which FlyChat account it belongs to — i.e. it came from GET /install,
// not the authenticated Connect Shopify flow. Holds the token until the
// merchant signs up/logs in and calls POST /api/shopify/claim with the
// single-use claim token from their redirect URL. Only claim_token_hash is
// stored, never the raw token (same reason passwords are hashed, not stored).
export const shopifyPendingInstallsTable = pgTable("shopify_pending_installs", {
  id: text("id").primaryKey(),
  shop: text("shop").notNull(),
  accessToken: text("access_token").notNull(),
  scope: text("scope"),
  // Same expiring-token fields as stores (see shopify-token.ts) — carried
  // over to the store row when this pending install is claimed, so a claim
  // that lands close to the 1hr access-token expiry doesn't lose the
  // refresh token needed to renew it.
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  clientId: text("client_id").notNull(),
  claimTokenHash: text("claim_token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  claimedAt: timestamp("claimed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertShopifyPendingInstallSchema = createInsertSchema(shopifyPendingInstallsTable).omit({ createdAt: true });
export type InsertShopifyPendingInstall = z.infer<typeof insertShopifyPendingInstallSchema>;
export type ShopifyPendingInstall = typeof shopifyPendingInstallsTable.$inferSelect;
