import { pgTable, text, boolean, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storeLanguageEnum = pgEnum("store_language", ["en", "fr"]);

export const storesTable = pgTable("stores", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  phone: text("phone"),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  defaultLanguage: storeLanguageEnum("default_language").notNull().default("en"),
  widgetLanguage: storeLanguageEnum("widget_language").notNull().default("en"),
  shippingWilayas: jsonb("shipping_wilayas").$type<string[]>().notNull().default([]),
  hasWebsite: boolean("has_website").notNull().default(false),
  needsHostedPage: boolean("needs_hosted_page").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
 aiEnabled: boolean("ai_enabled").notNull().default(false),
  aiSystemPrompt: text("ai_system_prompt"),
  aiFallbackToHuman: boolean("ai_fallback_to_human").notNull().default(true),
  shippingOptions: jsonb("shipping_options"),
  // Store-level Order Dispatch policy — see lib/order-dispatch.ts for the
  // default applied while this is NULL (an owner who has never opened
  // Team → Order Dispatch). Per-agent quota/active toggle live on
  // team_members instead (see schema/team.ts) — they're facts about an
  // agent, not store policy, and this way removing an agent can't leave an
  // orphaned entry in here.
  autoDispatch: jsonb("auto_dispatch").$type<{
    enabled: boolean;
    inactiveAgentRule: "none" | "transfer" | "redistribute";
    transferToAgentIds: string[];
  }>(),
  shopifyShop: text("shopify_shop"),
  shopifyAccessToken: text("shopify_access_token"),
  shopifyScope: text("shopify_scope"),
  shopifySyncedAt: timestamp("shopify_synced_at"),
  // Expiring offline tokens only (post-"expiring: 1" installs) — NULL for a
  // non-expiring legacy token (e.g. SK Elegance's), which never needs
  // refreshing. See artifacts/api-server/src/lib/shopify-token.ts.
  shopifyRefreshToken: text("shopify_refresh_token"),
  shopifyTokenExpiresAt: timestamp("shopify_token_expires_at"),
  shopifyRefreshTokenExpiresAt: timestamp("shopify_refresh_token_expires_at"),
  // Set when a refresh attempt comes back with a terminal failure (refresh
  // token expired, revoked, or rejected) — the store's Admin API access is
  // dead until the merchant reconnects through OAuth again. Cleared
  // automatically the next time a fresh token is stored (new install,
  // reconnect, claim, or a successful refresh).
  shopifyNeedsReconnect: boolean("shopify_needs_reconnect").notNull().default(false),
  // Which Shopify app (client_id) this store's install belongs to. Lets
  // compliance webhooks tell FLychatcod's legacy install apart from the new
  // public app's install for the same shop, so one app's mandatory webhooks
  // can't act on a store that has moved to the other app.
  shopifyAppClientId: text("shopify_app_client_id"),
  voiceCallerPhone: text("voice_caller_phone"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
