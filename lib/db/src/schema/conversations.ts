import { pgTable, text, integer, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const conversationStatusEnum = pgEnum("conversation_status", ["open", "closed", "pending", "archived"]);
export const channelEnum = pgEnum("channel", ["widget", "whatsapp", "instagram", "messenger"]);
export const messageSenderEnum = pgEnum("message_sender", ["customer", "agent", "bot", "system"]);
export const aiModeEnum = pgEnum("ai_mode", ["human", "ai_autopilot"]);

export const conversationsTable = pgTable("conversations", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  customerId: text("customer_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  visitorId: text("visitor_id"),
  sourcePageUrl: text("source_page_url"),
  referrer: text("referrer"),
  widgetLanguage: text("widget_language"),
  aiConversationLanguage: text("ai_conversation_language"),
  status: conversationStatusEnum("status").notNull().default("open"),
  channel: channelEnum("channel").notNull().default("widget"),
  assignedToId: text("assigned_to_id"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  unreadCount: integer("unread_count").notNull().default(0),
  aiMode: aiModeEnum("ai_mode").notNull().default("human"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull(),
  content: text("content").notNull(),
  sender: messageSenderEnum("sender").notNull(),
  senderId: text("sender_id"),
  senderName: text("sender_name"),
  isInternal: integer("is_internal").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ createdAt: true, updatedAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
