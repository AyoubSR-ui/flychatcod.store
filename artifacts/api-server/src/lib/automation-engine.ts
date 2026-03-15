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
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateId } from "./id.js";
import { getIO } from "../socket.js";

export type TriggerType = "new_conversation" | "keyword" | "order_created" | "inactivity";

export interface AutomationTriggerContext {
  storeId: string;
  conversationId: string;
  triggerType: TriggerType;
  /** Only set for keyword trigger */
  message?: { content: string; sender: string };
  /** Set for order_created trigger */
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
}

// ── Inactivity timer registry ─────────────────────────────────────────────────
// key = `${conversationId}:${ruleId}`
const inactivityTimers = new Map<string, NodeJS.Timeout>();

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Fire all matching, active rules for the given trigger context.
 * Call this after creating conversations or messages.
 * Errors are caught per-rule to prevent one failing action from blocking others.
 */
export async function fireTrigger(ctx: AutomationTriggerContext): Promise<void> {
  // Safety: keyword trigger must only fire for real customer messages
  if (ctx.triggerType === "keyword") {
    if (!ctx.message || ctx.message.sender !== "customer") return;
  }

  try {
    const rules = await db
      .select()
      .from(automationRulesTable)
      .where(
        and(
          eq(automationRulesTable.storeId, ctx.storeId),
          eq(automationRulesTable.trigger, ctx.triggerType as any),
          eq(automationRulesTable.isActive, true),
        ),
      );

    for (const rule of rules) {
      const cfg = (rule.config ?? {}) as Record<string, unknown>;

      // Evaluate keyword condition (optional — if no keyword set, fires on every message)
      if (ctx.triggerType === "keyword") {
        const content = (ctx.message?.content ?? "").toLowerCase();
        const matchType = (cfg.matchType as string) ?? "contains";

        // Support single keyword string
        if (typeof cfg.keyword === "string" && cfg.keyword.trim()) {
          const keyword = cfg.keyword.toLowerCase().trim();
          if (matchType === "exact" && content !== keyword) continue;
          if (matchType === "contains" && !content.includes(keyword)) continue;
        }

        // Support legacy `keywords` array — fires if any keyword matches
        if (Array.isArray(cfg.keywords) && cfg.keywords.length > 0) {
          const matched = cfg.keywords.some((k: unknown) => {
            if (typeof k !== "string") return false;
            const kw = k.toLowerCase().trim();
            return matchType === "exact" ? content === kw : content.includes(kw);
          });
          if (!matched) continue;
        }
      }

      await executeAction(rule, ctx).catch((err) => {
        console.error(`[AutoEngine] Action "${rule.action}" failed for rule ${rule.id}:`, err);
      });
    }
  } catch (err) {
    console.error(`[AutoEngine] Error loading rules for trigger "${ctx.triggerType}":`, err);
  }
}

/**
 * Call when a customer sends a new message.
 * Cancels all existing inactivity timers for the conversation, then
 * schedules new ones based on the store's active inactivity rules.
 */
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
        eq(automationRulesTable.trigger, "inactivity" as any),
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
      await fireInactivityRule(storeId, conversationId, rule);
    }, delayMs);

    inactivityTimers.set(key, timer);
  }
}

/** Cancel all inactivity timers for a conversation (on message or conversation close) */
export function cancelAllInactivityTimers(conversationId: string): void {
  for (const [key, timer] of inactivityTimers.entries()) {
    if (key.startsWith(`${conversationId}:`)) {
      clearTimeout(timer);
      inactivityTimers.delete(key);
    }
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

async function executeAction(
  rule: typeof automationRulesTable.$inferSelect,
  ctx: AutomationTriggerContext,
): Promise<void> {
  const cfg = (rule.config ?? {}) as Record<string, unknown>;

  switch (rule.action) {
    case "send_message": {
      // Support both new `message` field and legacy `message_en`/`message_fr` fields
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
        } catch {
          // socket not ready — message is in DB and will be seen on next load
        }
      }
      break;
    }

    case "assign_agent": {
      const agentId = typeof cfg.agentId === "string" ? cfg.agentId.trim() : "";
      if (!agentId) return;

      // Validate agent belongs to same store (multitenant safety)
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
      // Sends a real-time in-app notification to all connected agents for this store.
      // Does NOT insert a message into the conversation — invisible to the customer.
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
        // socket not ready — notification is best-effort
        console.warn(`[AutoEngine] Socket not ready for team_notification (rule: ${rule.id})`);
      }
      break;
    }

    case "create_order_flow":
    case "escalate":
    default:
      // Scaffolded for future implementation
      console.log(`[AutoEngine] Action "${rule.action}" is not yet implemented (rule: ${rule.id})`);
      break;
  }
}

async function fireInactivityRule(
  storeId: string,
  conversationId: string,
  rule: typeof automationRulesTable.$inferSelect,
): Promise<void> {
  try {
    // Re-verify the conversation is still open before acting
    const [conv] = await db
      .select({ id: conversationsTable.id, status: conversationsTable.status })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);

    if (!conv || conv.status !== "open") return;

    await executeAction(rule, {
      storeId,
      conversationId,
      triggerType: "inactivity",
    });
  } catch (err) {
    console.error("[AutoEngine] Inactivity rule execution failed:", err);
  }
}
