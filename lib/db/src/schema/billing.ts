import { pgTable, text, boolean, integer, timestamp, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planEnum = pgEnum("plan", ["free", "basic", "pro", "ai_addon"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "cancelled", "past_due", "trialing"]);
export const aiRunStatusEnum = pgEnum("ai_run_status", ["success", "failed", "blocked_no_credits", "blocked_plan", "blocked_mode", "blocked_sender"]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  currentPeriodStart: timestamp("current_period_start").notNull().defaultNow(),
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  externalSubscriptionId: text("external_subscription_id"),
  aiMonthlyCreditsIncluded: integer("ai_monthly_credits_included").notNull().default(0),
  aiExtraCreditsPurchased: integer("ai_extra_credits_purchased").notNull().default(0),
  aiCreditsUsedCurrentPeriod: integer("ai_credits_used_current_period").notNull().default(0),
  aiCreditsResetAt: timestamp("ai_credits_reset_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const aiRunsTable = pgTable("ai_runs", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  triggerMessageId: text("trigger_message_id"),
  responseMessageId: text("response_message_id"),
  modelName: text("model_name"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  totalTokens: integer("total_tokens"),
  creditsCharged: integer("credits_charged"),
  status: aiRunStatusEnum("status").notNull(),
  errorReason: text("error_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const aiCreditTopUpsTable = pgTable("ai_credit_top_ups", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  creditsAmount: integer("credits_amount").notNull(),
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  purchasedAt: timestamp("purchased_at").notNull().defaultNow(),
  externalPaymentId: text("external_payment_id"),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ createdAt: true, updatedAt: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;

export const insertAiRunSchema = createInsertSchema(aiRunsTable).omit({ createdAt: true });
export type InsertAiRun = z.infer<typeof insertAiRunSchema>;
export type AiRun = typeof aiRunsTable.$inferSelect;

export const insertAiCreditTopUpSchema = createInsertSchema(aiCreditTopUpsTable);
export type InsertAiCreditTopUp = z.infer<typeof insertAiCreditTopUpSchema>;
export type AiCreditTopUp = typeof aiCreditTopUpsTable.$inferSelect;
