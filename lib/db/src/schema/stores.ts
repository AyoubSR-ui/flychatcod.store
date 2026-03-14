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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({ createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
