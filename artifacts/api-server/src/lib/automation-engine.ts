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
  const darijaWords = /\b(salam|salem|wach|wech|wesh|labas|la bas|bghit|nheb|nbi|nabi|yah|yeh|yah|wla|wala|ana|hna|rani|daba|deja|kifach|kifesh|kayen|makaynch|mezyan|wakha|wakha|rah|rahi|raha|bach|kima|bzzaf|zwina|zwin|fra|fran|hadchi|hadchi|chno|chnou|fin|feen|fash|fech|kter|aktar|derja|darija|mazel|mazal|haja|had|li|dyal|dyali|ntuma|nta|nti|hia|hna|houma)\b/i;
  if (darijaWords.test(lower)) return "ar";

  // Common short French signals before full word list
  const frenchShort = /\b(oui|non|ok|tf|merci|svp|stp|allô|allo)\b/i;
  if (frenchShort.test(lower)) return "fr";

  // French accented characters
  const frenchAccents = /[àâäéèêëîïôùûüçœæ]/i;
  if (frenchAccents.test(text)) return "fr";

  // French stop-words and common phrases (including "tu parle france" style)
  const frenchWords = /\b(bonjour|bonsoir|salut|merci|je|vous|nous|est|une|des|les|pour|avec|sur|dans|mais|que|qui|comment|quel|quelle|bonne|bien|ici|veux|voudrais|commander|livraison|parle|parlez|france|francais|français|aussi|encore|toujours|jamais|beaucoup|votre|notre|mon|ma|mes|vos|leur|leurs|cette|cet|cette|avoir|être|faire|aller|venir|voir|savoir|pouvoir|vouloir|devoir)\b/i;
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

  if (aiReplyInFlight.has(triggerMessage.id)) return;
  aiReplyInFlight.add(triggerMessage.id);
  setTimeout(() => aiReplyInFlight.delete(triggerMessage.id), 30000);

  // ------------------------------------------------------------------
  // 1. Fetch conversation — including aiConversationLanguage
  // ------------------------------------------------------------------
  const [conv] = await db.select({
    aiMode: conversationsTable.aiMode,
    customerName: conversationsTable.customerName,
    customerPhone: conversationsTable.customerPhone,
    customerId: conversationsTable.customerId,
    widgetLanguage: conversationsTable.widgetLanguage,
    aiConversationLanguage: conversationsTable.aiConversationLanguage,
  })
    .from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
  if (!conv || conv.aiMode !== "ai_autopilot") return;

  // ------------------------------------------------------------------
  // 2. Language anchor: detect + persist on first meaningful message
  // ------------------------------------------------------------------
  let lockedLanguage = conv.aiConversationLanguage;
  let languageSource: "locked" | "detected" | "fallback" = "locked";

  if (!lockedLanguage) {
    if (isMeaningfulMessage(triggerMessage.content)) {
      lockedLanguage = detectLanguage(triggerMessage.content);
      languageSource = "detected";
      // Persist immediately so all future turns use it
      await db.update(conversationsTable)
        .set({ aiConversationLanguage: lockedLanguage })
        .where(eq(conversationsTable.id, conversationId));
    } else {
      lockedLanguage = conv.widgetLanguage || null;
      languageSource = "fallback";
    }
  }

  console.log(
    `[AI] conv=${conversationId} lang=${lockedLanguage ?? "unknown"} source=${languageSource}`,
  );

  // ------------------------------------------------------------------
  // 3. AI eligibility check
  // ------------------------------------------------------------------
  const aiStatus = await getAiStatus(storeId);

  if (!aiStatus.eligible) {
    const blockReason: "blocked_no_credits" | "blocked_plan" | "blocked_mode" | "blocked_sender" =
      aiStatus.statusLabel === "paused" ? "blocked_no_credits"
      : aiStatus.statusLabel === "not_included" ? "blocked_plan"
      : "blocked_mode";
    await recordBlockedRun(storeId, conversationId, triggerMessage.id, blockReason, aiStatus.statusLabel);
    return;
  }

  // ------------------------------------------------------------------
  // 4. Fetch store and products
  // ------------------------------------------------------------------
  const [store] = await db.select({ name: storesTable.name, aiSystemPrompt: storesTable.aiSystemPrompt })
    .from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  if (!store) return;

  const products = await db.select({
    name: productsTable.name,
    price: productsTable.price,
    stock: productsTable.stock,
    variants: productsTable.variants,
  })
    .from(productsTable)
    .where(and(eq(productsTable.storeId, storeId), eq(productsTable.isActive, true)))
    .orderBy(asc(productsTable.name))
    .limit(20);

  let productContext: string | null = null;
  if (products.length > 0) {
    productContext = products.map(p => {
      const variantsStr = Array.isArray(p.variants) && p.variants.length > 0
        ? p.variants.join(", ")
        : "N/A";
      const stockStr = p.stock != null ? String(p.stock) : "N/A";
      return `${p.name} | ${p.price} DZD | stock: ${stockStr} | variants: ${variantsStr}`;
    }).join("\n");
  }

  // ------------------------------------------------------------------
  // 5. Recent orders by phone (last 48h) for context
  // ------------------------------------------------------------------
  let recentOrdersContext: string | null = null;
  if (conv.customerPhone) {
    const normalizedPhone = conv.customerPhone.replace(/[^\d+]/g, "");
    if (normalizedPhone) {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const recentOrders = await db.select({
        orderNumber: ordersTable.orderNumber,
        status: ordersTable.status,
        total: ordersTable.total,
        createdAt: ordersTable.createdAt,
      })
        .from(ordersTable)
        .where(and(
          eq(ordersTable.storeId, storeId),
          eq(ordersTable.customerPhone, normalizedPhone),
          gte(ordersTable.createdAt, cutoff),
        ))
        .orderBy(desc(ordersTable.createdAt))
        .limit(3);

      if (recentOrders.length > 0) {
        recentOrdersContext = recentOrders.map(o =>
          `Order #${o.orderNumber} | Status: ${o.status} | Total: ${o.total} DZD | Placed: ${o.createdAt.toISOString()}`
        ).join("\n");
      }
    }
  }

  // ------------------------------------------------------------------
  // 6. Build filtered conversation history
  //    INCLUDE: customer messages, human agent messages
  //    EXCLUDE: AI autopilot replies (aiGenerated=true), bot/inactivity messages
  // ------------------------------------------------------------------
  const rawMessages = await db.select({
    id: messagesTable.id,
    content: messagesTable.content,
    sender: messagesTable.sender,
    senderName: messagesTable.senderName,
    metadata: messagesTable.metadata,
  })
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(40); // fetch more so filtering still leaves enough context

  rawMessages.reverse();

  // Filter to only customer + agent messages — exclude all AI and bot messages
  const includedMessages = rawMessages.filter(m => {
    if (m.sender === "customer") return true;
    if (m.sender === "agent") return true;
    // Exclude AI-generated bot replies and inactivity/automation bot messages
    return false;
  });

  // Ensure the trigger message is included (in case it was just inserted)
  const triggerInFiltered = includedMessages.some(m => m.id === triggerMessage.id);
  if (!triggerInFiltered) {
    includedMessages.push({
      id: triggerMessage.id,
      content: triggerMessage.content,
      sender: triggerMessage.sender,
      senderName: null,
      metadata: null,
    });
  }

  // Keep most recent 20 after filtering
  const historySlice = includedMessages.slice(-20);

  const history = historySlice
    .filter(m => m.content && m.content.trim().length > 0)
    .map(m => ({
      role: (m.sender === "customer" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

  const excludedCount = rawMessages.length - historySlice.length;
  console.log(
    `[AI] conv=${conversationId} history: ${history.length} included, ${excludedCount} excluded (raw=${rawMessages.length})`,
  );

  // ------------------------------------------------------------------
  // 7. Generate AI reply
  // ------------------------------------------------------------------
  try {
    const replyParams = {
      storeSystemPrompt: store.aiSystemPrompt,
      storeName: store.name,
      conversationHistory: history,
      customerName: conv.customerName,
      aiConversationLanguage: lockedLanguage,
      widgetLanguage: conv.widgetLanguage,
      productContext,
      recentOrdersContext,
    };

    let result = await generateAiReply(replyParams);

    // ------------------------------------------------------------------
    // 8. Anti-repetition guard — check last 3 AI replies for exact match
    // ------------------------------------------------------------------
    const recentAiReplies = await db.select({ content: messagesTable.content })
      .from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.sender, "bot"),
        sql`${messagesTable.metadata}::text LIKE '%"aiGenerated":true%'`,
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(3);

    const isRepeat = recentAiReplies.some(
      m => m.content.trim() === result.reply.trim(),
    );

    if (isRepeat) {
      console.log(`[AI] conv=${conversationId} anti-repeat guard fired — retrying with override`);
      result = await generateAiReply({ ...replyParams, antiRepeatRetry: true });
    }

    // ------------------------------------------------------------------
    // 9. Save AI reply + emit socket
    // ------------------------------------------------------------------
    const msgId = generateId("msg");
    await db.insert(messagesTable).values({
      id: msgId,
      conversationId,
      content: result.reply,
      sender: "bot",
      senderName: "AI Assistant",
      isInternal: 0,
      metadata: { aiGenerated: true },
    });

    await db.update(conversationsTable).set({ lastMessage: result.reply, updatedAt: new Date() })
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

    await consumeCredits(storeId, conversationId, triggerMessage.id, msgId, result.modelName, result.inputTokens, result.outputTokens, result.totalTokens);

    // ------------------------------------------------------------------
    // 10. Structured extraction — run after reply is sent (non-blocking on reply)
    //     Handles: auto order creation + AI cancellation
    // ------------------------------------------------------------------
    // Run extraction asynchronously so it doesn't delay the reply to the customer
    setImmediate(() => {
      runOrderExtractionFlow(storeId, conversationId, conv, store.name, lockedLanguage).catch(err => {
        console.error("[AI] Order extraction flow error:", err);
      });
    });

  } catch (err) {
    console.error("[AutoEngine] AI reply generation failed:", err);
    await db.insert((await import("@workspace/db")).aiRunsTable).values({
      id: generateId("airun"),
      storeId,
      conversationId,
      triggerMessageId: triggerMessage.id,
      responseMessageId: null,
      modelName: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      creditsCharged: 0,
      status: "failed",
      errorReason: (err as Error).message,
    });
  }
}

// ---------------------------------------------------------------------------
// Order extraction flow — runs after AI reply, handles create + cancel
// ---------------------------------------------------------------------------

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
): Promise<void> {
  // Fetch all customer-only messages in this conversation for extraction
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
  const extraction = await extractOrderState(texts, storeName);

  console.log(`[AI] conv=${conversationId} extraction: canCreate=${extraction.canAutoCreate} cancelIntent=${extraction.cancelIntent}`);

  // ── CANCELLATION FLOW ──────────────────────────────────────────────────
  if (extraction.cancelIntent) {
    await handleAiCancellation(storeId, conversationId, extraction.cancelPhone, lockedLanguage);
    return;
  }

  // ── AUTO ORDER CREATION ────────────────────────────────────────────────
  if (extraction.canAutoCreate) {
    await handleAiOrderCreation(storeId, conversationId, conv, extraction.orderData, lockedLanguage);
  }
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
    console.log(`[AI] conv=${conversationId} cancel intent but no phone — waiting for customer reply`);
    return;
  }

  const normalizedPhone = cancelPhone.replace(/[^\d+]/g, "");
  if (!normalizedPhone || normalizedPhone.length < 8) {
    console.log(`[AI] conv=${conversationId} cancel: phone too short, skip`);
    return;
  }

  // Look up recent non-finalized orders by phone + store
  const eligibleStatuses = ["new", "awaiting_confirmation", "confirmed"] as const;
  const eligibleOrders = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    status: ordersTable.status,
    customerPhone: ordersTable.customerPhone,
  })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.storeId, storeId),
      eq(ordersTable.customerPhone, normalizedPhone),
      inArray(ordersTable.status, [...eligibleStatuses]),
    ))
    .orderBy(desc(ordersTable.createdAt))
    .limit(3);

  let confirmationMessage: string;

  if (eligibleOrders.length === 0) {
    // No cancellable order found
    confirmationMessage = buildNoOrderMessage(language);
    console.log(`[AI] conv=${conversationId} cancel: no eligible orders for phone ${normalizedPhone}`);
  } else if (eligibleOrders.length === 1) {
    // Exactly one — cancel it
    const order = eligibleOrders[0];
    await db.update(ordersTable).set({
      status: "cancelled",
      cancelledBySource: "ai",
      updatedAt: new Date(),
    }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.storeId, storeId)));

    confirmationMessage = buildCancelConfirmMessage(order.orderNumber, language);
    console.log(`[AI] conv=${conversationId} cancelled order #${order.orderNumber} (AI-cancelled)`);
  } else {
    // Multiple orders — ask clarification
    const orderList = eligibleOrders.map(o => `#${o.orderNumber}`).join(", ");
    confirmationMessage = buildAmbiguousOrderMessage(orderList, language);
    console.log(`[AI] conv=${conversationId} cancel: multiple eligible orders, asking clarification`);
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
    console.log(`[AI] conv=${conversationId} auto-create blocked: missing required fields`);
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

  const customerPhone = orderData.phone.replace(/[^\d+]/g, "");
  const customerName = orderData.customerName;
  const wilaya = orderData.wilaya;
  const address = orderData.address || null;

  // Look up or create customer, scoped to this store
  let customerId: string | null = conv.customerId;

  if (!customerId && customerPhone) {
    const [existing] = await db.select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.storeId, storeId), eq(customersTable.phone, customerPhone)))
      .limit(1);

    if (existing) {
      customerId = existing.id;
      // Update customer name/wilaya if we have better data
      await db.update(customersTable).set({
        name: customerName || existing.id,
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
      console.log(`[AutoEngine] Inactivity rule ${rule.id} skipped — bot message already sent within delay window`);
      return;
    }

    await executeAction(rule, {
      storeId,
      conversationId,
      triggerType: "inactivity",
    });
  } catch (err) {
    console.error("[AutoEngine] Inactivity rule execution failed:", err);
  }
}
