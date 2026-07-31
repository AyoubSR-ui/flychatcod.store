import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const customersTable = pgTable("customers", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  wilaya: text("wilaya"),
  notes: text("notes"),
  profilePic: text("profile_pic"),
  isRepeat: boolean("is_repeat").notNull().default(false),
  totalOrders: integer("total_orders").notNull().default(0),
  // Real values match conversations.lead_stage exactly: 'interested' | 'engaged' | 'qualified_lead' | 'order_confirmed'
  leadStage: text("lead_stage").default("interested"),
  metaId: text("meta_id"),
  channel: text("channel"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({ createdAt: true, updatedAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
