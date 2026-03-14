import { pgTable, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const channelTypeEnum = pgEnum("channel_type", ["widget", "whatsapp", "instagram", "messenger"]);
export const channelStatusEnum = pgEnum("channel_status", ["disconnected", "pending", "connected", "error"]);

export const channelConnectionsTable = pgTable("channel_connections", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  channel: channelTypeEnum("channel").notNull(),
  status: channelStatusEnum("status").notNull().default("disconnected"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  accessToken: text("access_token"),
  webhookSecret: text("webhook_secret"),
  externalAccountId: text("external_account_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertChannelConnectionSchema = createInsertSchema(channelConnectionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertChannelConnection = z.infer<typeof insertChannelConnectionSchema>;
export type ChannelConnection = typeof channelConnectionsTable.$inferSelect;
