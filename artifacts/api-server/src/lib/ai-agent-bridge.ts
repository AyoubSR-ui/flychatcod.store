import { db, conversationsTable, messagesTable, ordersTable, orderItemsTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { generateId } from "./id.js";

const AGENT_URL = process.env.AI_AGENT_URL;
const AGENT_SECRET = process.env.AGENT_SECRET || "";

interface AgentMessage {
  role: "customer" | "agent" | "bot";
  content: string;
}

export interface AgentProduct {
  id: string;
  name: string;
  price: number;
  stock: number;
  variants?: unknown;
}

export interface AgentOrder {
  id: string;
  orderNumber: string;
  status: string;
  customerName?: string;
  customerPhone?: string;
}

interface AgentRequest {
  conversationId: string;
  storeId: string;
  storeName: string;
  aiSystemPrompt?: string;
  history: AgentMessage[];
  products: AgentProduct[];
  recentOrders: AgentOrder[];
  aiFlowState?: string;
  detectedLanguage?: string;
}

interface AgentResponse {
  reply: string;
  detectedLanguage: string;
  action: {
    type: "create_order" | "cancel_order" | "none";
    customerName?: string;
    customerPhone?: string;
    wilaya?: string;
    address?: string;
    items?: Array<{
      productId?: string;
      productName: string;
      price: number;
      quantity: number;
      variant?: string;
    }>;
  };
}

export async function callAiAgent(payload: AgentRequest): Promise<AgentResponse> {
  if (!AGENT_URL) {
    throw new Error("[AI Bridge] AI_AGENT_URL environment variable is not set.");
  }
  const res = await fetch(`${AGENT_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-secret": AGENT_SECRET,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[AI Bridge] Agent returned ${res.status}: ${text}`);
  }
  return res.json() as Promise<AgentResponse>;
}

const aiReplyInFlight = new Set<string>();

function isRepetitive(newReply: string, recentReplies: string[]): boolean {
  return recentReplies.some(
    (r) => r.trim().toLowerCase() === newReply.trim().toLowerCase()
  );
}

export async function callAiBridge(params: {
  messageId: string;
  conversationId: string;
  storeId: string;
  storeName: string;
  aiSystemPrompt?: string;
  products: AgentProduct[];
  recentOrders: AgentOrder[];
  emitNewMessage: (convId: string, storeId: string, msgId: string, content: string) => void;
  consumeCredits: () => Promise<void>;
  checkCredits: () => Promise<boolean>;
}): Promise<void> {
  const {
    messageId, conversationId, storeId, storeName, aiSystemPrompt,
    products, recentOrders, emitNewMessage, consumeCredits, checkCredits,
  } = params;

  if (aiReplyInFlight.has(messageId)) return;
  aiReplyInFlight.add(messageId);

  try {
    const hasCredits = await checkCredits();
    if (!hasCredits) return;

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId))
      .limit(1);
    if (!conv || conv.aiMode !== "ai_autopilot") return;

    const history = await db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    const agentHistory: AgentMessage[] = history.map((m) => ({
      role: (
        m.sender === "customer" ? "customer" :
        m.sender === "agent" ? "agent" :
        "bot"
      ) as AgentMessage["role"],
      content: m.content ?? "",
    }));

    const recentAiReplies = history
      .filter((m) => m.sender === "bot" && (m.metadata as Record<string, unknown> | null)?.aiGenerated)
      .slice(-3)
      .map((m) => m.content ?? "");

    const agentResponse = await callAiAgent({
      conversationId,
      storeId,
      storeName,
      aiSystemPrompt,
      history: agentHistory,
      products,
      recentOrders,
      aiFlowState: conv.aiFlowState ?? undefined,
      detectedLanguage: conv.aiConversationLanguage ?? undefined,
    });

    let { reply, detectedLanguage, action } = agentResponse;

    if (isRepetitive(reply, recentAiReplies)) {
      const retryResponse = await callAiAgent({
        conversationId,
        storeId,
        storeName,
        aiSystemPrompt: (aiSystemPrompt || "") + "\n\nIMPORTANT: Your last reply was repetitive. Rephrase completely.",
        history: agentHistory,
        products,
        recentOrders,
        aiFlowState: conv.aiFlowState ?? undefined,
        detectedLanguage,
      });
      reply = retryResponse.reply;
      action = retryResponse.action;
    }

    if (!conv.aiConversationLanguage && detectedLanguage) {
      await db
        .update(conversationsTable)
        .set({ aiConversationLanguage: detectedLanguage })
        .where(eq(conversationsTable.id, conversationId));
    }

    const replyMsgId = generateId("msg");
    await db.insert(messagesTable).values({
      id: replyMsgId,
      conversationId,
      content: reply,
      sender: "bot",
      metadata: { aiGenerated: true },
      createdAt: new Date(),
    });

    emitNewMessage(conversationId, storeId, replyMsgId, reply);
    await consumeCredits();

    if (action.type === "create_order") {
      await executeCreateOrderSilent(conversationId, storeId, conv.customerId, action);
    } else if (action.type === "cancel_order" && action.customerPhone) {
      await executeCancelOrderSilent(conversationId, storeId, action.customerPhone);
    }
  } catch (err) {
    console.error("[AI Bridge] callAiBridge failed:", err);
  } finally {
    aiReplyInFlight.delete(messageId);
  }
}

async function executeCreateOrderSilent(
  conversationId: string,
  storeId: string,
  customerId: string | null | undefined,
  action: AgentResponse["action"],
): Promise<void> {
  if (!action.customerName || !action.customerPhone || !action.wilaya) return;
  try {
    const orderId = generateId("ord");
    const orderNumber = `FLY-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const total = (action.items ?? [])
      .reduce((sum, item) => sum + item.price * item.quantity, 0)
      .toFixed(2);

    await db.insert(ordersTable).values({
      id: orderId,
      storeId,
      conversationId,
      customerId: customerId ?? null,
      status: "awaiting_confirmation",
      orderNumber,
      customerName: action.customerName,
      customerPhone: action.customerPhone,
      wilaya: action.wilaya,
      address: action.address ?? null,
      isCod: true,
      total,
      sellerNote: "Created by AI agent",
      createdBySource: "ai",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    for (const item of action.items ?? []) {
      await db.insert(orderItemsTable).values({
        id: generateId("oi"),
        orderId,
        productId: item.productId ?? null,
        productName: item.productName,
        price: String(item.price),
        quantity: item.quantity,
        variant: item.variant ?? null,
      });
    }

    await db
      .update(conversationsTable)
      .set({ aiFlowState: "order_created", updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));

    console.log(`[AI Bridge] Order ${orderNumber} created silently for conv ${conversationId}`);
  } catch (err) {
    console.error("[AI Bridge] Silent order creation failed:", err);
  }
}

async function executeCancelOrderSilent(
  conversationId: string,
  storeId: string,
  customerPhone: string,
): Promise<void> {
  try {
    const [targetOrder] = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.storeId, storeId),
          eq(ordersTable.customerPhone, customerPhone),
          inArray(ordersTable.status, ["new", "awaiting_confirmation", "confirmed"]),
        ),
      )
      .orderBy(desc(ordersTable.createdAt))
      .limit(1);

    if (!targetOrder) return;

    await db
      .update(ordersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(ordersTable.id, targetOrder.id));

    await db
      .update(conversationsTable)
      .set({ aiFlowState: "order_cancelled", updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));

    console.log(`[AI Bridge] Order ${targetOrder.orderNumber} cancelled silently for conv ${conversationId}`);
  } catch (err) {
    console.error("[AI Bridge] Silent cancellation failed:", err);
  }
}
