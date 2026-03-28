import { db, subscriptionsTable, storesTable, aiRunsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { generateId } from "./id.js";

export interface AiStatus {
  eligible: boolean;
  aiEnabled: boolean;
  creditsIncluded: number;
  creditsExtra: number;
  creditsUsed: number;
  creditsRemaining: number;
  statusLabel: "active" | "low_credits" | "paused" | "not_included" | "disabled";
  resetAt: Date | null;
}

export async function getAiStatus(storeId: string): Promise<AiStatus> {
  await resetMonthlyUsageIfNeeded(storeId);
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store) {
    return { eligible: false, aiEnabled: false, creditsIncluded: 0, creditsExtra: 0, creditsUsed: 0, creditsRemaining: 0, statusLabel: "not_included", resetAt: null };
  }

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, store.organizationId)).limit(1);
  if (!sub) {
    return { eligible: false, aiEnabled: store.aiEnabled, creditsIncluded: 0, creditsExtra: 0, creditsUsed: 0, creditsRemaining: 0, statusLabel: "not_included", resetAt: null };
  }

  // Get credits from plan definition — subscription table may not have been updated
 const PLAN_AI_CREDITS: Record<string, number> = {
  free: 50, starter: 2000, pro: 10000, agency: 30000,
  };
 const planCredits = PLAN_AI_CREDITS[sub.plan] ?? 0;
 const monthlyCredits = Math.max(sub.aiMonthlyCreditsIncluded, planCredits);
 const totalCredits = monthlyCredits + sub.aiExtraCreditsPurchased;
 const creditsRemaining = Math.max(0, totalCredits - sub.aiCreditsUsedCurrentPeriod);

  if (totalCredits === 0) {
    return { eligible: false, aiEnabled: store.aiEnabled, creditsIncluded: monthlyCredits, creditsExtra: sub.aiExtraCreditsPurchased, creditsUsed: sub.aiCreditsUsedCurrentPeriod, creditsRemaining: 0, statusLabel: "not_included", resetAt: sub.aiCreditsResetAt };
  }

  if (!store.aiEnabled) {
    return { eligible: false, aiEnabled: false, creditsIncluded: monthlyCredits, creditsExtra: sub.aiExtraCreditsPurchased, creditsUsed: sub.aiCreditsUsedCurrentPeriod, creditsRemaining, statusLabel: "disabled", resetAt: sub.aiCreditsResetAt };
  }

  if (creditsRemaining <= 0) {
    return { eligible: false, aiEnabled: true, creditsIncluded: monthlyCredits, creditsExtra: sub.aiExtraCreditsPurchased, creditsUsed: sub.aiCreditsUsedCurrentPeriod, creditsRemaining: 0, statusLabel: "paused", resetAt: sub.aiCreditsResetAt };
  }

  const lowThreshold = totalCredits * 0.1;
  const statusLabel = creditsRemaining <= lowThreshold ? "low_credits" : "active";

  return {
    eligible: true,
    aiEnabled: true,
    creditsIncluded: sub.aiMonthlyCreditsIncluded,
    creditsExtra: sub.aiExtraCreditsPurchased,
    creditsUsed: sub.aiCreditsUsedCurrentPeriod,
    creditsRemaining,
    statusLabel,
    resetAt: sub.aiCreditsResetAt,
  };
}

export async function consumeCredits(
  storeId: string,
  conversationId: string,
  triggerMessageId: string | null,
  responseMessageId: string | null,
  modelName: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens: number,
): Promise<void> {
  const [store] = await db.select({ organizationId: storesTable.organizationId }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store) return;

  const creditsCharged = totalTokens;

  await db.update(subscriptionsTable).set({
    aiCreditsUsedCurrentPeriod: sql`${subscriptionsTable.aiCreditsUsedCurrentPeriod} + ${creditsCharged}`,
    updatedAt: new Date(),
  }).where(eq(subscriptionsTable.organizationId, store.organizationId));

  await db.insert(aiRunsTable).values({
    id: generateId("airun"),
    storeId,
    conversationId,
    triggerMessageId,
    responseMessageId,
    modelName,
    inputTokens,
    outputTokens,
    totalTokens,
    creditsCharged,
    status: "success",
  });
}

export async function recordBlockedRun(
  storeId: string,
  conversationId: string,
  triggerMessageId: string | null,
  status: "blocked_no_credits" | "blocked_plan" | "blocked_mode" | "blocked_sender",
  errorReason: string,
): Promise<void> {
  await db.insert(aiRunsTable).values({
    id: generateId("airun"),
    storeId,
    conversationId,
    triggerMessageId,
    responseMessageId: null,
    modelName: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    creditsCharged: 0,
    status,
    errorReason,
  });
}

export async function resetMonthlyUsageIfNeeded(storeId: string): Promise<void> {
  const [store] = await db.select({ organizationId: storesTable.organizationId }).from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store) return;

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.organizationId, store.organizationId)).limit(1);
  if (!sub || !sub.aiCreditsResetAt) return;

  if (new Date() >= sub.aiCreditsResetAt) {
    const nextReset = new Date(sub.currentPeriodEnd);
    await db.update(subscriptionsTable).set({
      aiCreditsUsedCurrentPeriod: 0,
      aiCreditsResetAt: nextReset,
      updatedAt: new Date(),
    }).where(eq(subscriptionsTable.id, sub.id));
  }
}
