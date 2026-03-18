import { pgTable, text, boolean, integer, numeric, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
