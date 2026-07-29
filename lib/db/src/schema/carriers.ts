import { pgTable, text, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const carrierStatusEnum = pgEnum("carrier_status", ["connected", "error", "disconnected"]);
export const shipmentStatusEnum = pgEnum("shipment_status", [
  "not_shipped",
  "label_created",
  "label_purchased",
  "label_printed",
  "confirmed",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "failed",
  "cancelled",
]);

export const carrierConnectionsTable = pgTable("carrier_connections", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  carrier: text("carrier").notNull(),
  label: text("label").notNull(),
  status: carrierStatusEnum("status").notNull().default("connected"),
  // Encrypted at rest (AES-256-GCM, see lib/credentials-crypto.ts) — never
  // stored as plain JSON and never sent to any third party.
  credentials: text("credentials").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const shipmentsTable = pgTable("shipments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  storeId: text("store_id").notNull(),
  carrierConnectionId: text("carrier_connection_id").notNull(),
  carrier: text("carrier").notNull(),
  trackingNumber: text("tracking_number"),
  status: shipmentStatusEnum("status").notNull().default("not_shipped"),
  labelUrl: text("label_url"),
  rawResponse: jsonb("raw_response").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCarrierConnectionSchema = createInsertSchema(carrierConnectionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertCarrierConnection = z.infer<typeof insertCarrierConnectionSchema>;
export type CarrierConnection = typeof carrierConnectionsTable.$inferSelect;

export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({ createdAt: true, updatedAt: true });
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;
