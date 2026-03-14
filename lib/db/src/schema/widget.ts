import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const widgetPositionEnum = pgEnum("widget_position", ["bottom-right", "bottom-left"]);

export const widgetConfigsTable = pgTable("widget_configs", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull().unique(),
  welcomeMessageEn: text("welcome_message_en").notNull().default("Hello! How can we help you today?"),
  welcomeMessageFr: text("welcome_message_fr").notNull().default("Bonjour! Comment pouvons-nous vous aider aujourd'hui?"),
  defaultLanguage: text("default_language").notNull().default("fr"),
  primaryColor: text("primary_color").notNull().default("#2563eb"),
  position: widgetPositionEnum("position").notNull().default("bottom-right"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertWidgetConfigSchema = createInsertSchema(widgetConfigsTable).omit({ createdAt: true, updatedAt: true });
export type InsertWidgetConfig = z.infer<typeof insertWidgetConfigSchema>;
export type WidgetConfig = typeof widgetConfigsTable.$inferSelect;
