import { pgTable, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderEventTypeEnum = pgEnum("order_event_type", [
  "status_change",
  "parcel_created",
  "label_created",
  "note_added",
]);

export const orderEventsTable = pgTable("order_events", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  eventType: orderEventTypeEnum("event_type").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  description: text("description"),
  createdBy: text("created_by").notNull().default("System"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderEventSchema = createInsertSchema(orderEventsTable).omit({ createdAt: true });
export type InsertOrderEvent = z.infer<typeof insertOrderEventSchema>;
export type OrderEvent = typeof orderEventsTable.$inferSelect;
