/**
 * FlyChat COD Automation Engine
 *
 * Executes automation rules stored in the automation_rules table.
 *
 * Supported triggers:
 *   - new_conversation  → fires when a widget visitor creates a new conversation
 *   - keyword           → fires when a customer sends a message (optional keyword filter)
 *   - inactivity        → fires after X minutes of no new customer message
 *   - order_created     → fires when an order is created (scaffold, wired)
 *
 * Supported actions:
 *   - send_message  → inserts a bot message + emits socket new_message event
 *   - assign_agent  → sets conversation.assignedToId (validated to same store)
 *   - add_tag       → appends a tag to conversation.tags[]
 *   - ai_reply      → generates an AI reply using the AI service (credit-gated)
 *   - create_order_flow / escalate → scaffolded (no-op for now)
 *
 * INACTIVITY SCHEDULER NOTE:
 *   Timers are held in-process memory. They are lost on server restart.
 *   A future version should use a persistent job queue (BullMQ + Redis).
 *   Timers are keyed `${convId}:${ruleId}` so each rule gets its own timer.
 *   When a customer sends a new message, all timers for that conversation
 *   are cancelled and rescheduled — preventing false inactivity fires.
 */

import {
  db,
  automationRulesTable,
  conversationsTable,
  messagesTable,
  teamMembersTable,
  storesTable,
  productsTable,
  ordersTable,
  orderItemsTable,
  customersTable,
} from "@workspace/db";
import { eq, and, desc, gte, asc, sql, inArray } from "drizzle-orm";
import { generateId, generateOrderNumber } from "./id.js";
import { getIO } from "../socket.js";
import { generateAiReply, extractOrderState } from "./ai-service.js";
import { getAiStatus, consumeCredits, recordBlockedRun } from "./ai-credits.js";
import { callAiBridge, type AgentProduct, type AgentOrder } from "./ai-agent-bridge.js";

export type TriggerType = "new_conversation" | "keyword" | "order_created" | "inactivity";

export interface AutomationTriggerContext {
  storeId: string;
  conversationId: string;
  triggerType: TriggerType;
  message?: { content: string; sender: string; id?: string; metadata?: Record<string, unknown> };
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
}

const inactivityTimers = new Map<string, NodeJS.Timeout>();

export async function fireTrigger(ctx: AutomationTriggerContext): Promise<void> {
  if (ctx.triggerType === "keyword") {
    if (!ctx.message || ctx.message.sender !== "customer") return;
    if (ctx.message.metadata?.aiGenerated) return;
  }

  try {
    const triggerValue: typeof automationRulesTable.$inferSelect.trigger = ctx.triggerType;
    const rules = await db
      .select()
      .from(automationRulesTable)
      .where(
        and(
          eq(automationRulesTable.storeId, ctx.storeId),
          eq(automationRulesTable.trigger, triggerValue),
          eq(automationRulesTable.isActive, true),
        ),
      );

    for (const rule of rules) {
      const cfg = (rule.config ?? {}) as Record<string, unknown>;

      if (ctx.triggerType === "keyword") {
        const content = (ctx.message?.content ?? "").toLowerCase();
        const matchType = (cfg.matchType as string) ?? "contains";

        if (typeof cfg.keyword === "string" && cfg.keyword.trim()) {
          const keyword = cfg.keyword.toLowerCase().trim();
          if (matchType === "exact" && content !== keyword) continue;
          if (matchType === "contains" && !content.includes(keyword)) continue;
        }

        if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
          const matched = cfg.keywords.some((k: unknown) => {
            if (typeof k !== "string") return false;
            const kw = k.toLowerCase().trim();
            return matchType === "exact" ? content === kw : content.includes(kw);
          });
          if (!matched) continue;
        }

        // Skip ai_reply action here — the direct handleAiReplyForMessage call is the sole AI path
        if ((rule.action as string) === "ai_reply") continue;
      }

      await executeAction(rule, ctx).catch((err) => {
        console.error(`[AutoEngine] Action "${rule.action}" failed for rule ${rule.id}:`, err);
      });
    }
  } catch (err) {
    console.error(`[AutoEngine] Error loading rules for trigger "${ctx.triggerType}":`, err);
  }
}

export async function rescheduleInactivityChecks(
  storeId: string,
  conversationId: string,
): Promise<void> {
  cancelAllInactivityTimers(conversationId);

  const rules = await db
    .select()
    .from(automationRulesTable)
    .where(
      and(
        eq(automationRulesTable.storeId, storeId),
        eq(automationRulesTable.trigger, "inactivity" as typeof automationRulesTable.$inferSelect.trigger),
        eq(automationRulesTable.isActive, true),
      ),
    );

  for (const rule of rules) {
    const cfg = (rule.config ?? {}) as Record<string, unknown>;
    const delayMinutes = typeof cfg.delayMinutes === "number" ? cfg.delayMinutes : 10;
    const delayMs = Math.max(1, delayMinutes) * 60 * 1000;
    const key = `${conversationId}:${rule.id}`;

    const timer = setTimeout(async () => {
      inactivityTimers.delete(key);
      await fireInactivityRule(storeId, conversationId, rule, delayMinutes);
    }, delayMs);

    inactivityTimers.set(key, timer);
  }
}

export function cancelAllInactivityTimers(conversationId: string): void {
  for (const [key, timer] of inactivityTimers.entries()) {
    if (key.startsWith(`${conversationId}:`)) {
      clearTimeout(timer);
      inactivityTimers.delete(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Language detection helpers
// ---------------------------------------------------------------------------

/**
 * Detect the primary language of a text string using Unicode range checks
 * and a list of common French and Darija marker words.
 * Returns "ar", "fr", or "en".
 */
function detectLanguage(text: string): "ar" | "fr" | "en" {
  if (!text || text.trim().length === 0) return "en";

  // Arabic / Darija: Arabic Unicode block
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  if (arabicPattern.test(text)) return "ar";

  const lower = text.toLowerCase().trim();

  // Darija (Algerian/Moroccan dialect in Latin script) markers — detect before French
  const darijaWords = /\b(salam|salem|wach|wech|wesh|labas|la bas|bghit|nheb|nbi|nabi|yah|yeh|wla|wala|ana|hna|rani|daba|deja|kifach|kifesh|kayen|makaynch|mezyan|mzyan|wakha|waxha|rah|rahi|raha|bach|kima|bzzaf|zwina|zwin|hadchi|chno|chnou|fin|feen|fash|fech|kter|aktar|derja|darija|mazel|mazal|haja|had|li|dyal|dyali|ntuma|nta|nti|hia|hna|houma|tamam|baskat|waslat|ncanceli|nalgi|notlab|3andi|ma3ndi|manich|chhal|bchhal|la3ziz|saha|sahit|yatik|mn 3andkom|mn 3andkum|3andkum|3andkom|nbghi|ndir commande|dispo|mazal dispo|mazal kayn)\b/i;
  if (darijaWords.test(lower)) return "ar";

  // Explicit French-intent phrases (e.g. "tu parle france", "parle francais")
  const frenchPhrases = /tu\s+parle[sz]?\s+(fran[cç]ai[sz]?|france)|parle[sz]?\s+fran[cç]ai[sz]?/i;
  if (frenchPhrases.test(lower)) return "fr";

  // Common short French signals before full word list (including weak signals pls/plz which lean French in context)
  const frenchShort = /\b(oui|non|ok|tf|merci|svp|stp|allô|allo|pls|plz)\b/i;
  if (frenchShort.test(lower)) return "fr";

  // French accented characters
  const frenchAccents = /[àâäéèêëîïôùûüçœæ]/i;
  if (frenchAccents.test(text)) return "fr";

  // French stop-words and common phrases
  const frenchWords = /\b(bonjour|bonsoir|salut|merci|je|vous|nous|est|une|des|les|pour|avec|sur|dans|mais|que|qui|comment|quel|quelle|bonne|bien|ici|veux|voudrais|commander|livraison|parle|parlez|france|francais|français|aussi|encore|toujours|jamais|beaucoup|votre|notre|mon|ma|mes|vos|leur|leurs|cette|cet|avoir|être|faire|aller|venir|voir|savoir|pouvoir|vouloir|devoir)\b/i;
  if (frenchWords.test(lower)) return "fr";

  return "en";
}

/**
 * A message is "meaningful" for language anchoring if it has real content
 * beyond punctuation/whitespace only. Single Arabic words (e.g. "سلام") count as meaningful.
 */
function isMeaningfulMessage(content: string): boolean {
  // Arabic Unicode content counts regardless of length
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  if (arabicPattern.test(content)) return true;

  const stripped = content.replace(/[\s!?.,:;'"*_\-#@]/g, "").trim();
  return stripped.length > 1;
}

// ---------------------------------------------------------------------------
// Dominant intent classifier — fast regex, no AI call.
// Used BEFORE generating the AI reply and BEFORE extraction flow.
// Ensures only ONE primary flow executes per customer message.
// ---------------------------------------------------------------------------

type DominantIntent =
  | "cancel"           // explicit cancel request
  | "new_order"        // explicit new order / buy intent
  | "order_confirm"    // confirming an order summary
  | "thanks_closing"   // thank-you / closing / positive acknowledgement
  | "product_inquiry"  // asking about products / availability
  | "other";           // everything else — AI handles conversationally

function classifyDominantIntent(recentCustomerMessages: string[]): DominantIntent {
  if (recentCustomerMessages.length === 0) return "other";

  const latest = recentCustomerMessages[recentCustomerMessages.length - 1] || "";
  const latLow = latest.toLowerCase();

  // ── Arabic / Darija script checks ─────────────────────────────────────────
  // Cancel intent
  const arabicCancelPat = /بغيت.*(نكنسل|نلغي|ألغي|نكانسل)|حاب.*(نكنسل|نلغي|ألغي|نكانسل)|أبغي.*(نلغي|نكنسل)|نكنسل|نلغي|ألغي|نكانسل/;
  if (arabicCancelPat.test(latest)) return "cancel";

  // New order intent (broad: covers طلب، نشري، نكومند، حاب طلب، راني حاب)
  const arabicOrderPat = /بغيت.*(نطلب|نأمر|نكومند|نشري|طلب)|راني\s*(حاب|بغي).*(طلب|نشري|نكومند|نطلب)|حاب.*(نطلب|طلب|نكومند|نشري|نأمر)|ممكن\s*نطلب|بغيت\s*طلب|نطلب|نشري\s*منكم|نشري\s*من\s*عندكم|أبغي\s*أطلب/;
  if (arabicOrderPat.test(latest)) return "new_order";

  // Thanks / closing in Arabic/Darija script
  const arabicThanksPat = /يعطيك.*(الصحة|صحة)|وفيك.*(البركة|بركة)|بارك\s*الله|شكرا|الحمد\s*لله|مشكور|بوركت/;
  if (arabicThanksPat.test(latest)) return "thanks_closing";

  // Product inquiry in Arabic/Darija script
  const arabicProductPat = /ممكن\s*(نعرف|نشوف|شوف)|عندكم\s*(منتجات|بضاعة|منتوج|أحذية|ملابس)|واش\s*(عندكم|كاين|دispo)|أش\s*عندكم|شنو\s*عندكم|علاش\s*المنتوج/;
  if (arabicProductPat.test(latest)) return "product_inquiry";

  // ── Latin script (Darija/FR/EN) ─────────────────────────────────────────
  // Cancel
  const latinCancel = /\b(cancel|annul|annuler|ncanceli|nalgi|bghit\s+ncanceli|bghit\s+nalgi|nheb\s+ncanceli|je\s+veux\s+(annuler|cancel|l.annuler)|i\s+want\s+to\s+cancel|can\s+i\s+cancel)\b/i;
  if (latinCancel.test(latLow)) return "cancel";

  // New order (Darija + FR + EN)
  const latinOrder = /\b(nheb\s+n(otlab|ommande|shri|commande)|bghit\s+n(otlab|ommande|shri|commande)|nbghi\s+notlab|ndir\s+commande|can\s+i\s+(order|make\s+a?\s*order|place\s+a?\s*order)|i\s+want\s+to\s+(order|buy)|je\s+veux\s+(commander|acheter|passer)|new\s+order|nouvelle\s+commande|passer\s+(une\s+)?commande|faire\s+(une\s+)?commande|bghit\s+nshri|nheb\s+ncommande|bghit\s+ncommande)\b/i;
  if (latinOrder.test(latLow)) return "new_order";

  // Thanks / closing
  const latinThanks = /\b(yatik\s+saha|wafik\s+(el\s+)?baraka|merci(\s+beaucoup)?|thank(\s+you)?|thanks|saha(\s+bzaf)?|sahit|barak\s+allah|7amdullah)\b/i;
  if (latinThanks.test(latLow)) return "thanks_closing";

  // Product inquiry
  const latinProduct = /\b(produits?|catalogue|what\s+(products?|do\s+you\s+have|items?)|quel(s)?\s+produits?|vos\s+produits?|wach\s+dispo|mazal\s+dispo|wach\s+kayn|les\s+produits?|show\s+me|what\s+do\s+you\s+sell)\b/i;
  if (latinProduct.test(latLow)) return "product_inquiry";

  return "other";
}

// ---------------------------------------------------------------------------
// AI reply dedup guard
// ---------------------------------------------------------------------------

const aiReplyInFlight = new Set<string>();

export async function handleAiReplyForMessage(
  storeId: string,
  conversationId: string,
  triggerMessage: { id: string; content: string; sender: string; metadata?: Record<string, unknown> },
): Promise<void> {
  if (triggerMessage.sender !== "customer") return;
  if (triggerMessage.metadata?.aiGenerated) return;

  // ------------------------------------------------------------------
  // Fetch prerequisites for AI bridge
  // ------------------------------------------------------------------
  const [store] = await db
    .select({ name: storesTable.name, aiSystemPrompt: storesTable.aiSystemPrompt })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);
  if (!store) return;

  const rawProducts = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      price: productsTable.price,
      stock: productsTable.stock,
      variants: productsTable.variants,
      imageUrl: productsTable.imageUrl,
      description: productsTable.description,
    })
    .from(productsTable)
    .where(and(eq(productsTable.storeId, storeId), eq(productsTable.isActive, true)))
    .orderBy(asc(productsTable.name))
    .limit(20);

  const products: AgentProduct[] = rawProducts.map((p) => ({
    id: p.id,
    name: p.name,
    price: Number(p.price),
    stock: p.stock ?? 0,
    variants: p.variants,
    imageUrl: p.imageUrl ?? undefined,
    description: p.description ?? undefined,
  }));

  const recentOrders: AgentOrder[] = await db
    .select({
      id: ordersTable.id,
      orderNumber: ordersTable.orderNumber,
      status: ordersTable.status,
      customerName: ordersTable.customerName,
      customerPhone: ordersTable.customerPhone,
    })
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);

  // ------------------------------------------------------------------
  // Delegate to AI bridge (callAiBridge handles dedup, credits, socket)
  // ------------------------------------------------------------------
  await callAiBridge({
    messageId: triggerMessage.id,
    conversationId,
    storeId,
    storeName: store.name,
    aiSystemPrompt: store.aiSystemPrompt ?? undefined,
    products,
    recentOrders,
    emitNewMessage: (convId, sId, msgId, content) => {
      try {
        const io = getIO();
        const msg = {
          id: msgId,
          content,
          sender: "bot",
          senderName: "AI Assistant",
          metadata: { aiGenerated: true },
          createdAt: new Date(),
        };
        io.to(`conv:${convId}`).emit("new_message", { conversationId: convId, message: msg });
        io.to(`store:${sId}`).emit("new_message", { conversationId: convId, message: msg });
      } catch {
        // Socket not ready — message already in DB, client will poll
      }
    },
    consumeCredits: async () => {
      await consumeCredits(storeId, conversationId, triggerMessage.id, null, "gpt-4o-mini", 0, 0, 0);
    },
    checkCredits: async () => {
      const status = await getAiStatus(storeId);
      return status.eligible;
    },
  });
}

// ---------------------------------------------------------------------------
// Order extraction flow — runs after AI reply, handles create + cancel
// ---------------------------------------------------------------------------
// Normalize phone to a consistent 10-digit Algerian format (0XXXXXXXXX).
// Handles: +213XXXXXXXXX, 00213XXXXXXXXX, 213XXXXXXXXX (12-digit), 0XXXXXXXXX (10-digit)
// Strips all non-digit characters first, then normalizes the country-code prefix.
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  // +213XXXXXXXXX or 00213XXXXXXXXX → 0XXXXXXXXX
  if (digits.length === 14 && digits.startsWith("00213")) {
    digits = "0" + digits.slice(5);
  } else if (digits.length === 12 && digits.startsWith("213")) {
    digits = "0" + digits.slice(3);
  }
  return digits;
}

// Compare two phones robustly:
// 1. Exact normalized match (primary)
// 2. Last-9-digits suffix match (fallback for legacy 9-digit stored phones)
function phonesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na === nb) return true;
  if (na.length >= 9 && nb.length >= 9) {
    return na.slice(-9) === nb.slice(-9);
  }
  return false;
}

// Detect if the latest customer message signals a NEW order or cancellation cycle
// Used to reset aiFlowState when a fresh cycle begins after a completed one.
function isNewCycleSignal(text: string): boolean {
  const lower = text.toLowerCase();
  // Arabic new cancel intent
  const arabicCancel = /بغيت.*(نكنسل|نلغي|ألغي)|نكنسل|نلغي/;
  const arabicOrder  = /بغيت.*(نطلب|نأمر|نكومند)|نطلب|نأمر/;
  if (arabicCancel.test(text) || arabicOrder.test(text)) return true;

  // Latin-script new cycle signals (Darija + FR + EN)
  const newCyclePattern = /\b(cancel|annul|annuler|ncanceli|nalgi|bghit ncanceli|bghit nalgi|bghit nshri|nheb nshri|i want to (order|buy|cancel)|je veux (commander|annuler|cancel)|nheb notlab|bghit notlab|nbghi notlab|nheb ncommande|bghit ncommande|ndir commande|new order|nouvelle commande|autre commande)\b/i;
  return newCyclePattern.test(lower);
}

async function runOrderExtractionFlow(
  storeId: string,
  conversationId: string,
  conv: {
    customerName: string;
    customerPhone: string | null;
    customerId: string | null;
  },
  storeName: string,
  lockedLanguage: string | null,
  aiFlowState: string | null,
  dominantIntent: DominantIntent,
): Promise<void> {

  // ── INTENT ARBITRATION ────────────────────────────────────────────────
  // Skip extraction entirely for intents the AI reply already handled.
  // This prevents "product inquiry → cancellation lookup" and "thanks → cancel" bugs.
  if (dominantIntent === "thanks_closing" || dominantIntent === "product_inquiry") {
    return;
  }

  // ── Re-read aiFlowState from DB to avoid stale state ─────────────────
  const [freshConv] = await db.select({ aiFlowState: conversationsTable.aiFlowState })
    .from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
  const currentFlowState = freshConv?.aiFlowState ?? aiFlowState;

  // ── NEW ORDER intent: clear stale cancel state, run order path only ───
  if (dominantIntent === "new_order") {
    if (currentFlowState === "order_cancelled" || currentFlowState === "pending_cancel_choice") {
      console.log(`[AI] conv=${conversationId} new_order intent: clearing stale cancel state (${currentFlowState})`);
      await db.update(conversationsTable).set({ aiFlowState: null })
        .where(eq(conversationsTable.id, conversationId));
    }
    // Only run order creation path — cancellation is off-limits for this intent
    const customerMessages = await db.select({ content: messagesTable.content })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.sender, "customer"),
      ))
      .orderBy(asc(messagesTable.createdAt))
      .limit(40);
    if (customerMessages.length === 0) return;

    const texts = customerMessages.map(m => m.content);
    const { result: extraction, inputTokens, outputTokens, totalTokens } = await extractOrderState(texts, storeName);
    if (totalTokens > 0) {
      consumeCredits(storeId, conversationId, null, null, "gpt-4o-mini", inputTokens, outputTokens, totalTokens)
        .catch(err => console.error("[AI] extraction credit error:", err));
    }
    if (extraction.canAutoCreate) {
      await handleAiOrderCreation(storeId, conversationId, conv, extraction.orderData, lockedLanguage);
    }
    return;
  }

  // ── CANCEL intent: bypass extraction, run cancellation path directly ──
  if (dominantIntent === "cancel") {
    // If already waiting for order selection, delegate to pending choice handler
    if (currentFlowState === "pending_cancel_choice") {
      await handlePendingCancelChoice(storeId, conversationId, lockedLanguage);
      return;
    }
    // Extract cancel phone from customer history
    const customerMessages = await db.select({ content: messagesTable.content })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.sender, "customer"),
      ))
      .orderBy(asc(messagesTable.createdAt))
      .limit(40);
    if (customerMessages.length === 0) return;

    const texts = customerMessages.map(m => m.content);
    const { result: extraction, inputTokens, outputTokens, totalTokens } = await extractOrderState(texts, storeName);
    if (totalTokens > 0) {
      consumeCredits(storeId, conversationId, null, null, "gpt-4o-mini", inputTokens, outputTokens, totalTokens)
        .catch(err => console.error("[AI] extraction credit error:", err));
    }
    await handleAiCancellation(storeId, conversationId, extraction.cancelPhone, lockedLanguage);
    return;
  }

  // ── "other" / "order_confirm" intent: full state-machine + extraction ─

  // State machine guard for terminal states
  if (currentFlowState === "order_cancelled" || currentFlowState === "order_created") {
    const [lastMsg] = await db.select({ content: messagesTable.content })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.sender, "customer"),
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    if (lastMsg && isNewCycleSignal(lastMsg.content)) {
      await db.update(conversationsTable).set({ aiFlowState: null })
        .where(eq(conversationsTable.id, conversationId));
      // Fall through to full extraction
    } else {
      return;
    }
  }

  // Pending cancel choice: let customer pick which order to cancel
  if (currentFlowState === "pending_cancel_choice") {
    const [lastPendMsg] = await db.select({ content: messagesTable.content })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.sender, "customer"),
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    if (lastPendMsg && isNewCycleSignal(lastPendMsg.content)) {
      await db.update(conversationsTable).set({ aiFlowState: null })
        .where(eq(conversationsTable.id, conversationId));
      // Fall through to full extraction
    } else {
      await handlePendingCancelChoice(storeId, conversationId, lockedLanguage);
      return;
    }
  }

  // Full extraction for order_confirm / other
  const customerMessages = await db.select({ content: messagesTable.content })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.conversationId, conversationId),
      eq(messagesTable.sender, "customer"),
    ))
    .orderBy(asc(messagesTable.createdAt))
    .limit(40);

  if (customerMessages.length === 0) return;

  const texts = customerMessages.map(m => m.content);
  const { result: extraction, inputTokens, outputTokens, totalTokens } = await extractOrderState(texts, storeName);


  if (totalTokens > 0) {
    consumeCredits(storeId, conversationId, null, null, "gpt-4o-mini", inputTokens, outputTokens, totalTokens)
      .catch(err => console.error("[AI] extraction credit error:", err));
  }

  // STRICT: never run cancellation when dominant intent signals new order
  if (extraction.cancelIntent && dominantIntent !== "new_order") {
    await handleAiCancellation(storeId, conversationId, extraction.cancelPhone, lockedLanguage);
    return;
  }

  if (extraction.canAutoCreate) {
    await handleAiOrderCreation(storeId, conversationId, conv, extraction.orderData, lockedLanguage);
  }
}

// ---------------------------------------------------------------------------
// Handle pending_cancel_choice: customer selects which order to cancel
// ---------------------------------------------------------------------------
async function handlePendingCancelChoice(
  storeId: string,
  conversationId: string,
  language: string | null,
): Promise<void> {
  // Fetch the last 10 customer messages — we need both the phone (to re-validate)
  // and the order number (from the latest message) to prevent cross-customer cancellation
  const recentMsgs = await db.select({ content: messagesTable.content })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.conversationId, conversationId),
      eq(messagesTable.sender, "customer"),
    ))
    .orderBy(desc(messagesTable.createdAt))
    .limit(10);

  if (recentMsgs.length === 0) return;

  const latestContent = recentMsgs[0].content;

  // Extract the target order from the latest message.
  // Order number format is FLY-YYMMDD-#### (e.g. FLY-260318-0042).
  // Customers may type the full number, the #FLY-... form, or just the 4-digit suffix.
  let targetOrderNumber: string | null = null;

  // 1. Try to match a full FLY-YYMMDD-#### order number (case-insensitive)
  const fullMatch = latestContent.match(/\bFLY-\d{6}-\d{4}\b/i);
  if (fullMatch) {
    targetOrderNumber = fullMatch[0].toUpperCase();
  }

  // 2. Fall back to 4-digit numeric suffix (customer types "1234" or "#1234")
  if (!targetOrderNumber) {
    const suffixMatch = latestContent.match(/\b(\d{4})\b/);
    if (suffixMatch) {
      targetOrderNumber = suffixMatch[1]; // will be matched as suffix below
    }
  }

  if (!targetOrderNumber) {
    return;
  }

  // Re-extract the customer phone from the last 10 messages (security: bind to original phone)
  // Accept digits with optional separators: spaces, dashes, dots, parentheses
  // e.g. 0661 23 45 67, +213-661-23-45-67, (0661) 234567
  let customerNormalizedPhone: string | null = null;
  const phonePattern = /(?:\+?213[\s\-.]?|0)[5-7][\d\s\-.()\/.]{7,14}/g;
  for (const msg of [...recentMsgs].reverse()) {
    const phoneMatches = msg.content.match(phonePattern);
    if (phoneMatches) {
      const normalized = normalizePhone(phoneMatches[0]);
      // Must be 9-12 digits after normalization (Algerian phone: 10 digits starting 0 or 12 digits with 213)
      if (normalized.length >= 9 && normalized.length <= 12) {
        customerNormalizedPhone = normalized;
        break;
      }
    }
  }

  if (!customerNormalizedPhone) {
    return;
  }

  // Fetch eligible cancellable orders for this store
  const allCancellable = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    status: ordersTable.status,
    customerPhone: ordersTable.customerPhone,
  })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.storeId, storeId),
      inArray(ordersTable.status, ["new", "awaiting_confirmation", "confirmed"]),
    ))
    .orderBy(desc(ordersTable.createdAt))
    .limit(50);

  // Filter by phone — phonesMatch applies exact + suffix fallback (security: scoped to customer)
  const phoneEligible = allCancellable.filter(o =>
    o.customerPhone && customerNormalizedPhone ? phonesMatch(o.customerPhone, customerNormalizedPhone) : false
  );

  // Find the specific order the customer chose — must be in the phone-bound eligible list.
  // Match by full order number OR by the 4-digit suffix (e.g. customer types "1234" → "FLY-260318-1234")
  const order = phoneEligible.find(o => {
    if (!targetOrderNumber) return false;
    // Full match (e.g. "FLY-260318-1234")
    if (o.orderNumber === targetOrderNumber) return true;
    // Suffix match: targetOrderNumber is 4 digits, order number ends with "-XXXX"
    if (/^\d{4}$/.test(targetOrderNumber) && o.orderNumber.endsWith(`-${targetOrderNumber}`)) return true;
    return false;
  });

  if (!order) {
    return;
  }

  // Cancel it — scoped to both store and order id (double check)
  await db.update(ordersTable).set({
    status: "cancelled",
    cancelledBySource: "ai",
    updatedAt: new Date(),
  }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.storeId, storeId)));

  // Update flow state
  await db.update(conversationsTable).set({ aiFlowState: "order_cancelled" })
    .where(eq(conversationsTable.id, conversationId));

  const msg = buildCancelConfirmMessage(order.orderNumber, language);
  await emitBotMessage(storeId, conversationId, msg, { aiGenerated: true, aiAction: "cancel" });

  console.log(`[AI] conv=${conversationId} pending_cancel_choice: cancelled order #${order.orderNumber} for phone ${customerNormalizedPhone}`);
}

// ---------------------------------------------------------------------------
// AI-assisted order cancellation
// ---------------------------------------------------------------------------

async function handleAiCancellation(
  storeId: string,
  conversationId: string,
  cancelPhone: string | null,
  language: string | null,
): Promise<void> {
  if (!cancelPhone) {
    // Phone number missing — the AI's conversational reply should have asked for it
    return;
  }

  const normalizedPhone = normalizePhone(cancelPhone);
  if (!normalizedPhone || normalizedPhone.length < 8) {
    return;
  }

  // Look up recent non-finalized orders by phone + store
  // Use normalized phone comparison to handle different formatting
  const eligibleStatuses = ["new", "awaiting_confirmation", "confirmed"] as const;
  const allCancellable = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    status: ordersTable.status,
    customerPhone: ordersTable.customerPhone,
  })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.storeId, storeId),
      inArray(ordersTable.status, [...eligibleStatuses]),
    ))
    .orderBy(desc(ordersTable.createdAt))
    .limit(50);

  // Filter by phone — exact normalized match first, suffix fallback for legacy phones
  const eligibleOrders = allCancellable.filter(o => {
    if (!o.customerPhone) return false;
    return phonesMatch(o.customerPhone, cancelPhone);
  }).slice(0, 3);

  let confirmationMessage: string;

  if (eligibleOrders.length === 0) {
    // No cancellable order found
    confirmationMessage = buildNoOrderMessage(language);
    // No flow state change — let customer retry with correct phone
  } else if (eligibleOrders.length === 1) {
    // Exactly one — cancel it
    const order = eligibleOrders[0];
    await db.update(ordersTable).set({
      status: "cancelled",
      cancelledBySource: "ai",
      updatedAt: new Date(),
    }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.storeId, storeId)));

    // Persist flow state: cancellation complete
    await db.update(conversationsTable).set({ aiFlowState: "order_cancelled" })
      .where(eq(conversationsTable.id, conversationId));

    confirmationMessage = buildCancelConfirmMessage(order.orderNumber, language);
    console.log(`[AI] conv=${conversationId} cancelled order #${order.orderNumber} (AI-cancelled)`);
  } else {
    // Multiple orders — ask clarification
    const orderList = eligibleOrders.map(o => `#${o.orderNumber}`).join(", ");
    confirmationMessage = buildAmbiguousOrderMessage(orderList, language);

    // Persist flow state: waiting for customer to pick order
    await db.update(conversationsTable).set({ aiFlowState: "pending_cancel_choice" })
      .where(eq(conversationsTable.id, conversationId));

  }

  await emitBotMessage(storeId, conversationId, confirmationMessage, { aiGenerated: true, aiAction: "cancel" });
}

function buildNoOrderMessage(language: string | null): string {
  if (language === "ar") return "ما لقيت حتى طلب ممكن يتألغى بهاد الرقم. تقدر تعطيني رقم الطلب؟";
  if (language === "fr") return "Je n'ai trouvé aucune commande annulable avec ce numéro. Pouvez-vous vérifier votre numéro de téléphone ou me donner le numéro de commande ?";
  return "I couldn't find any cancellable order with that phone number. Please double-check your number or share the order number.";
}

function buildCancelConfirmMessage(orderNumber: string, language: string | null): string {
  if (language === "ar") return `تمام، الطلب #${orderNumber} تألغى بنجاح. إذا عندك أي سؤال راسلنا هنا.`;
  if (language === "fr") return `Votre commande #${orderNumber} a bien été annulée. N'hésitez pas à nous contacter si vous avez des questions.`;
  return `Your order #${orderNumber} has been cancelled successfully. Feel free to reach out if you need anything.`;
}

function buildAmbiguousOrderMessage(orderList: string, language: string | null): string {
  if (language === "ar") return `لقيت أكثر من طلب (${orderList}). أنهم الطلب تبغي تلغي؟`;
  if (language === "fr") return `J'ai trouvé plusieurs commandes éligibles (${orderList}). Laquelle souhaitez-vous annuler ?`;
  return `I found multiple eligible orders (${orderList}). Which one would you like to cancel?`;
}

// ---------------------------------------------------------------------------
// AI-assisted order creation
// ---------------------------------------------------------------------------

async function handleAiOrderCreation(
  storeId: string,
  conversationId: string,
  conv: { customerName: string; customerPhone: string | null; customerId: string | null },
  orderData: {
    productName: string | null;
    variant: string | null;
    quantity: number | null;
    customerName: string | null;
    phone: string | null;
    wilaya: string | null;
    address: string | null;
  },
  language: string | null,
): Promise<void> {
  // Validate all required fields are present
  if (
    !orderData.productName ||
    !orderData.quantity ||
    orderData.quantity < 1 ||
    !orderData.customerName ||
    !orderData.phone ||
    !orderData.wilaya
  ) {
    return;
  }

  // Duplicate prevention: check if this conversation already has an AI-created order
  const [existingAiOrder] = await db.select({ id: ordersTable.id })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.conversationId, conversationId),
      eq(ordersTable.createdBySource, "ai"),
    ))
    .limit(1);

  if (existingAiOrder) {
    console.log(`[AI] conv=${conversationId} auto-create skipped: AI order already exists (${existingAiOrder.id})`);
    return;
  }

  const customerPhone = normalizePhone(orderData.phone);
  const customerName = orderData.customerName;
  const wilaya = orderData.wilaya;
  const address = orderData.address || null;

  // Look up or create customer, scoped to this store
  let customerId: string | null = conv.customerId;

  if (!customerId && customerPhone) {
    const [existing] = await db.select({ id: customersTable.id, name: customersTable.name })
      .from(customersTable)
      .where(and(eq(customersTable.storeId, storeId), eq(customersTable.phone, customerPhone)))
      .limit(1);

    if (existing) {
      customerId = existing.id;
      // Update customer name/wilaya if we have better data (never overwrite with blanks)
      await db.update(customersTable).set({
        name: customerName || existing.name,
        ...(wilaya ? { wilaya } : {}),
        updatedAt: new Date(),
      }).where(eq(customersTable.id, existing.id));
    } else {
      const newCustId = generateId("cust");
      await db.insert(customersTable).values({
        id: newCustId,
        storeId,
        name: customerName,
        phone: customerPhone,
        wilaya: wilaya || null,
      });
      customerId = newCustId;
    }
  }

  // Find product price if we can match it
  const [matchedProduct] = await db.select({ price: productsTable.price, id: productsTable.id })
    .from(productsTable)
    .where(and(
      eq(productsTable.storeId, storeId),
      eq(productsTable.isActive, true),
      sql`lower(${productsTable.name}) LIKE lower(${"%" + (orderData.productName || "") + "%"})`,
    ))
    .limit(1);

  const unitPrice = matchedProduct ? Number(matchedProduct.price) : 0;
  const qty = orderData.quantity;
  const total = unitPrice * qty;

  const orderId = generateId("ord");
  const orderNumber = generateOrderNumber();

  await db.insert(ordersTable).values({
    id: orderId,
    orderNumber,
    storeId,
    customerId: customerId || null,
    conversationId,
    customerName,
    customerPhone,
    wilaya,
    address,
    status: "awaiting_confirmation",
    isCod: true,
    total: total.toString(),
    createdBySource: "ai",
  });

  await db.insert(orderItemsTable).values({
    id: generateId("oi"),
    orderId,
    productId: matchedProduct?.id || null,
    productName: orderData.productName,
    variant: orderData.variant || null,
    quantity: qty,
    price: unitPrice.toString(),
  });

  // Update conversation with real customer info if it was anonymous
  await db.update(conversationsTable).set({
    customerId: customerId || undefined,
    customerPhone: customerPhone || undefined,
    customerName: customerName || undefined,
    updatedAt: new Date(),
  }).where(eq(conversationsTable.id, conversationId));

  // Update customer order stats
  if (customerId) {
    const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` })
      .from(ordersTable)
      .where(and(eq(ordersTable.customerId, customerId), eq(ordersTable.storeId, storeId)));
    const totalOrders = Number(cnt);
    await db.update(customersTable).set({
      totalOrders,
      isRepeat: totalOrders > 1,
      updatedAt: new Date(),
    }).where(eq(customersTable.id, customerId));
  }

  console.log(`[AI] conv=${conversationId} auto-created order #${orderNumber} (AI, awaiting_confirmation)`);

  // Persist flow state: order creation complete — suppress future extraction
  await db.update(conversationsTable).set({ aiFlowState: "order_created" })
    .where(eq(conversationsTable.id, conversationId));

  // Send confirmation message to the visitor
  const confirmMsg = buildOrderConfirmMessage(orderNumber, orderData.productName || "", qty, language);
  await emitBotMessage(storeId, conversationId, confirmMsg, { aiGenerated: true, aiAction: "order_created", orderId, orderNumber });

  // Fire order_created automation
  fireTrigger({
    storeId,
    conversationId,
    triggerType: "order_created",
    orderId,
    orderNumber,
    customerName,
  }).catch(err => console.error("[AI] order_created automation error:", err));
}

function buildOrderConfirmMessage(orderNumber: string, productName: string, qty: number, language: string | null): string {
  if (language === "ar") {
    return `تمام! طلبك تسجل بنجاح 🎉\n\nرقم الطلب: #${orderNumber}\nالمنتج: ${productName} × ${qty}\nالحالة: في انتظار التأكيد\n\nفريقنا راح يتصل بيك لتأكيد الطلب قريباً. إذا بغيت تلغي، راسلنا هنا وراح نعاونك.`;
  }
  if (language === "fr") {
    return `Parfait ! Votre commande a bien été enregistrée 🎉\n\nNuméro de commande : #${orderNumber}\nProduit : ${productName} × ${qty}\nStatut : En attente de confirmation\n\nNotre équipe va vous contacter prochainement pour confirmer. Si vous souhaitez annuler, revenez ici et nous vous aiderons.`;
  }
  return `Great news! Your order has been placed successfully 🎉\n\nOrder #${orderNumber}\nProduct: ${productName} × ${qty}\nStatus: Awaiting confirmation\n\nOur team will contact you shortly to confirm. If you wish to cancel, just message us here and we'll help you.`;
}

// ---------------------------------------------------------------------------
// Shared helper: save bot message and emit socket
// ---------------------------------------------------------------------------

async function emitBotMessage(
  storeId: string,
  conversationId: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  // ── Near-duplicate guard: suppress if identical to the most recent bot message ──
  const [lastBotMsg] = await db.select({ content: messagesTable.content })
    .from(messagesTable)
    .where(and(
      eq(messagesTable.conversationId, conversationId),
      eq(messagesTable.sender, "bot"),
    ))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  if (lastBotMsg) {
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalize(lastBotMsg.content) === normalize(content)) {
      return;
    }
  }

  const msgId = generateId("msg");
  await db.insert(messagesTable).values({
    id: msgId,
    conversationId,
    content,
    sender: "bot",
    senderName: "AI Assistant",
    isInternal: 0,
    metadata,
  });

  await db.update(conversationsTable).set({ lastMessage: content, updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  try {
    const io = getIO();
    const [savedMsg] = await db.select({
      id: messagesTable.id, content: messagesTable.content, sender: messagesTable.sender,
      senderName: messagesTable.senderName, metadata: messagesTable.metadata, createdAt: messagesTable.createdAt,
    }).from(messagesTable).where(eq(messagesTable.id, msgId));

    if (savedMsg) {
      io.to(`conv:${conversationId}`).emit("new_message", { conversationId, message: savedMsg });
      io.to(`store:${storeId}`).emit("new_message", { conversationId, message: savedMsg });
    }
  } catch {}
}

async function executeAction(
  rule: typeof automationRulesTable.$inferSelect,
  ctx: AutomationTriggerContext,
): Promise<void> {
  const cfg = (rule.config ?? {}) as Record<string, unknown>;

  switch (rule.action) {
    case "send_message": {
      // When this is a new_conversation welcome message, suppress it if AI Autopilot
      // is eligible for the store. The AI handles the first customer message directly,
      // and a pre-inserted bot greeting contaminates the conversation context.
      if (ctx.triggerType === "new_conversation") {
        const aiStatus = await getAiStatus(ctx.storeId);
        if (aiStatus.eligible) {
          console.log(
            `[AutoEngine] Rule ${rule.id}: new_conversation send_message suppressed — AI Autopilot is active for store ${ctx.storeId}`,
          );
          return;
        }
      }

      const messageText = (
        typeof cfg.message === "string" ? cfg.message :
        typeof cfg.message_en === "string" ? cfg.message_en :
        typeof cfg.message_fr === "string" ? cfg.message_fr : ""
      ).trim();
      if (!messageText) {
        console.warn(`[AutoEngine] Rule ${rule.id} send_message has no message text`);
        return;
      }

      const msgId = generateId("msg");
      await db.insert(messagesTable).values({
        id: msgId,
        conversationId: ctx.conversationId,
        content: messageText,
        sender: "bot",
        senderName: "Bot",
        isInternal: 0,
      });

      await db
        .update(conversationsTable)
        .set({ lastMessage: messageText, updatedAt: new Date() })
        .where(eq(conversationsTable.id, ctx.conversationId));

      const [msg] = await db
        .select({
          id: messagesTable.id,
          content: messagesTable.content,
          sender: messagesTable.sender,
          senderName: messagesTable.senderName,
          metadata: messagesTable.metadata,
          createdAt: messagesTable.createdAt,
        })
        .from(messagesTable)
        .where(eq(messagesTable.id, msgId));

      if (msg) {
        try {
          const io = getIO();
          io.to(`conv:${ctx.conversationId}`).emit("new_message", {
            conversationId: ctx.conversationId,
            message: msg,
          });
          io.to(`store:${ctx.storeId}`).emit("new_message", {
            conversationId: ctx.conversationId,
            message: msg,
          });
        } catch {}
      }
      break;
    }

    case "assign_agent": {
      const agentId = typeof cfg.agentId === "string" ? cfg.agentId.trim() : "";
      if (!agentId) return;

      const [agent] = await db
        .select({ id: teamMembersTable.id })
        .from(teamMembersTable)
        .where(
          and(
            eq(teamMembersTable.id, agentId),
            eq(teamMembersTable.storeId, ctx.storeId),
          ),
        )
        .limit(1);

      if (!agent) {
        console.warn(`[AutoEngine] Agent ${agentId} not found in store ${ctx.storeId}`);
        return;
      }

      await db
        .update(conversationsTable)
        .set({ assignedToId: agentId, updatedAt: new Date() })
        .where(eq(conversationsTable.id, ctx.conversationId));

      try {
        const io = getIO();
        io.to(`store:${ctx.storeId}`).emit("conversation_updated", {
          conversationId: ctx.conversationId,
          update: { assignedToId: agentId },
        });
      } catch {}
      break;
    }

    case "add_tag": {
      const tag = typeof cfg.tag === "string" ? cfg.tag.trim() : "";
      if (!tag) return;

      const [conv] = await db
        .select({ tags: conversationsTable.tags })
        .from(conversationsTable)
        .where(eq(conversationsTable.id, ctx.conversationId))
        .limit(1);

      if (!conv) return;

      const currentTags: string[] = Array.isArray(conv.tags) ? conv.tags : [];
      if (!currentTags.includes(tag)) {
        await db
          .update(conversationsTable)
          .set({ tags: [...currentTags, tag], updatedAt: new Date() })
          .where(eq(conversationsTable.id, ctx.conversationId));
      }
      break;
    }

    case "notify_team": {
      const defaultMsg = ctx.orderNumber
        ? `New order ${ctx.orderNumber} created${ctx.customerName ? ` for ${ctx.customerName}` : ""}`
        : `New order created in conversation`;

      const notifText = (typeof cfg.message === "string" && cfg.message.trim())
        ? cfg.message
        : defaultMsg;

      try {
        const io = getIO();
        io.to(`store:${ctx.storeId}`).emit("team_notification", {
          type: ctx.triggerType,
          message: notifText,
          conversationId: ctx.conversationId,
          orderId: ctx.orderId ?? null,
          orderNumber: ctx.orderNumber ?? null,
          customerName: ctx.customerName ?? null,
          timestamp: new Date().toISOString(),
        });
        console.log(`[AutoEngine] team_notification emitted to store ${ctx.storeId}: "${notifText}"`);
      } catch {
        console.warn(`[AutoEngine] Socket not ready for team_notification (rule: ${rule.id})`);
      }
      break;
    }

    case "ai_reply": {
      if (ctx.message) {
        if (ctx.message.sender !== "customer") return;
        if (ctx.message.metadata?.aiGenerated) return;
        await handleAiReplyForMessage(ctx.storeId, ctx.conversationId, {
          id: ctx.message.id || "",
          content: ctx.message.content,
          sender: ctx.message.sender,
          metadata: ctx.message.metadata,
        });
      } else {
        await handleAiReplyForMessage(ctx.storeId, ctx.conversationId, {
          id: generateId("msg"),
          content: "[New conversation started]",
          sender: "customer",
        });
      }
      break;
    }

    case "create_order_flow":
    case "escalate":
    default:
      console.log(`[AutoEngine] Action "${rule.action}" is not yet implemented (rule: ${rule.id})`);
      break;
  }
}

async function fireInactivityRule(
  storeId: string,
  conversationId: string,
  rule: typeof automationRulesTable.$inferSelect,
  delayMinutes: number,
): Promise<void> {
  try {
    const [conv] = await db
      .select({ id: conversationsTable.id, status: conversationsTable.status })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conv || conv.status !== "open") return;

    // Deduplication: check if a bot message already exists within the delay window
    const windowStart = new Date(Date.now() - delayMinutes * 60 * 1000);
    const recentBotMessages = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.sender, "bot"),
        gte(messagesTable.createdAt, windowStart),
      ))
      .limit(1);

    if (recentBotMessages.length > 0) {
      return;
    }

    await executeAction(rule, {
      storeId,
      conversationId,
      triggerType: "inactivity",
    });
  } catch (err) {
  }
}
