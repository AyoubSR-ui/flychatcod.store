import { pgTable, text, boolean, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const automationTriggerEnum = pgEnum("automation_trigger", [
  "new_conversation",
  "keyword",
  "order_created",
  "inactivity",
]);

export const automationActionEnum = pgEnum("automation_action", [
  "send_message",
  "assign_agent",
  "add_tag",
  "create_order_flow",
  "escalate",
]);

export const automationRulesTable = pgTable("automation_rules", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  name: text("name").notNull(),
  trigger: automationTriggerEnum("trigger").notNull(),
  action: automationActionEnum("action").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAutomationRuleSchema = createInsertSchema(automationRulesTable).omit({ createdAt: true, updatedAt: true });
export type InsertAutomationRule = z.infer<typeof insertAutomationRuleSchema>;
export type AutomationRule = typeof automationRulesTable.$inferSelect;
