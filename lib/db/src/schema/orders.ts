import { pgTable, text, boolean, integer, numeric, jsonb, timestamp, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "awaiting_confirmation",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "suspicious",
  "self_confirmation",
  "self_confirmed",
  "no_answer",
  "callback",
]);

export const ordersTable = pgTable("orders", {
  id: text("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  storeId: text("store_id").notNull(),
  customerId: text("customer_id"),
  conversationId: text("conversation_id"),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email"),
  wilaya: text("wilaya").notNull(),
  address: text("address"),
  status: orderStatusEnum("status").notNull().default("new"),
  isCod: boolean("is_cod").notNull().default(true),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  sellerNote: text("seller_note"),
  createdBySource: text("created_by_source"),
  cancelledBySource: text("cancelled_by_source"),
  shippingFee: numeric("shipping_fee", { precision: 10, scale: 2 }).default("0"),
  shippingOption: text("shipping_option"),
  shopifyOrderId: text("shopify_order_id"),
  confirmedBySource: text("confirmed_by_source"),
  voiceCallSid: text("voice_call_sid"),
  assignedAgentId: text("assigned_agent_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  // Makes Shopify order import idempotent: webhook retries and a concurrent
  // /sync/orders can both try to insert the same Shopify order, and the
  // SELECT-then-INSERT they use has a race window between the two statements.
  // The insert paths rely on this for ON CONFLICT DO UPDATE.
  // Scoped by store_id because store_id is this app's tenant boundary — the
  // same shop connected to two stores keeps a row per store.
  // NULL shopify_order_id (native FlyChat orders) is exempt: NULL never
  // equals NULL in a UNIQUE constraint.
  unique("orders_store_shopify_order_id_unique").on(table.storeId, table.shopifyOrderId),
]);

export const orderItemsTable = pgTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  productId: text("product_id"),
  productName: text("product_name").notNull(),
  variant: text("variant"),
  quantity: integer("quantity").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const insertOrderItemSchema = createInsertSchema(orderItemsTable);
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
