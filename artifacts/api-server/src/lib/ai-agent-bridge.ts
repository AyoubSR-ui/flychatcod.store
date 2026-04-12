import { db, pool, conversationsTable, messagesTable, ordersTable, orderItemsTable, storesTable } from "@workspace/db";import { eq, and, inArray, desc } from "drizzle-orm";
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
  imageUrl?: string;
  description?: string;
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
  shippingOptions?: Record<string, unknown>;
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
    shippingOption?: string;
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
const conversationBatch = new Map<string, { timer: any; messageId: string }>();

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

  // ── 3-second batch window — wait for customer to finish typing ──────────────
  await new Promise<void>((resolve) => {
    if (conversationBatch.has(conversationId)) {
      clearTimeout(conversationBatch.get(conversationId)!.timer);
    }
    const timer = setTimeout(() => {
      conversationBatch.delete(conversationId);
      resolve();
    }, 3000);
    conversationBatch.set(conversationId, { timer, messageId });
  });

  // If a newer message came in during the wait, skip this one
  const current = conversationBatch.get(conversationId);
  if (current && current.messageId !== messageId) return;

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

   // Fetch shipping options for this store
    const { rows: shippingRows } = await pool.query(
      `SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`,
      [storeId]
    );
    const shippingOptions = shippingRows[0]?.shipping_options ?? undefined;
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
      shippingOptions: shippingOptions ?? undefined,
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

    // DEDUP FIX: only create order if not already created in this conversation
    if (action.type === "create_order") {
      if (conv.aiFlowState === "order_created") {
        // Check if existing order is still active (pending/awaiting)
        const [existingOrder] = await db
          .select({ id: ordersTable.id, status: ordersTable.status, customerPhone: ordersTable.customerPhone })
          .from(ordersTable)
          .where(and(
            eq(ordersTable.conversationId, conversationId),
            eq(ordersTable.createdBySource, "ai"),
          ))
          .orderBy(desc(ordersTable.createdAt))
          .limit(1);

        const activeStatuses = ["new", "awaiting_confirmation", "confirmed"];
        const isSamePhone = existingOrder?.customerPhone === action.customerPhone;

        if (existingOrder && activeStatuses.includes(existingOrder.status) && isSamePhone) {
          // Same customer, active order exists — skip and inform AI
          console.log(`[AI Bridge] Active order exists for conv ${conversationId} — skipping duplicate`);
        } else {
          // Different customer OR order is cancelled/delivered → allow new order
          console.log(`[AI Bridge] Resetting aiFlowState — new order allowed for conv ${conversationId}`);
          await db.update(conversationsTable)
            .set({ aiFlowState: null })
            .where(eq(conversationsTable.id, conversationId));
          await executeCreateOrderSilent(conversationId, storeId, conv.customerId, action, detectedLanguage);
        }
      } else {
        await executeCreateOrderSilent(conversationId, storeId, conv.customerId, action, detectedLanguage);
      }
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
  detectedLanguage?: string,
): Promise<void> {
  if (!action.customerName || !action.customerPhone || !action.wilaya) return;
  try {
    const orderId = generateId("ord");
    const orderNumber = `FLY-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const itemsTotal = (action.items ?? [])
      .reduce((sum, item) => sum + item.price * item.quantity, 0);

    // Get shipping price from shipping options based on wilaya
    let shippingPrice = 0;
    try {
      const { rows: storeRows } = await pool.query(
        `SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`,
        [storeId]
      );
      const shippingOptions = storeRows[0]?.shipping_options;
      if (shippingOptions && action.wilaya) {
        const wilayaPrices = shippingOptions.wilayaPrices || {};
        const wilayaKey = Object.keys(wilayaPrices).find(
          k => k.toLowerCase() === action.wilaya!.toLowerCase()
        );
        if (wilayaKey) {
          const shippingOption = action.shippingOption || "home_delivery";
          shippingPrice = shippingOption === "pickup"
            ? (wilayaPrices[wilayaKey]?.pickup || 0)
            : (wilayaPrices[wilayaKey]?.home || 0);
        }
      }
    } catch {}

    const total = (itemsTotal + shippingPrice).toFixed(2);

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
      shippingFee: String(shippingPrice),
      shippingOption: action.shippingOption ?? null,
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

    // Mark conversation so subsequent messages don't re-trigger order creation
    await db
      .update(conversationsTable)
      .set({ aiFlowState: "order_created", updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));
  
    console.log(`[AI Bridge] Order ${orderNumber} created for conv ${conversationId}`);
    // Trigger voice confirmation call
   try {
  const { triggerOrderConfirmationCall } = await import("./voice-call.js");
  const [store] = await db.select({ name: storesTable.name })
    .from(storesTable).where(eq(storesTable.id, storeId)).limit(1);
  const firstItem = action.items?.[0];
  await triggerOrderConfirmationCall({
    customerPhone: action.customerPhone!,
    customerName: action.customerName!,
    storeName: store?.name || "Notre boutique",
    productName: firstItem?.productName || "votre produit",
    wilaya: action.wilaya!,
    price: total,
    orderNumber,
    orderId,
    storeId,
    detectedLanguage,
  });
  } catch (callErr) {
    console.error("[Voice] Call trigger failed:", callErr);
  }

  // Push order to Shopify
  try {
    const { pushOrderToShopify } = await import("../routes/shopify.js");
    await pushOrderToShopify(storeId, orderId);
  } catch (shopifyErr) {
    console.error("[Shopify] Push order failed:", shopifyErr);
  }

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

    console.log(`[AI Bridge] Order ${targetOrder.orderNumber} cancelled for conv ${conversationId}`);
  } catch (err) {
    console.error("[AI Bridge] Silent cancellation failed:", err);
  }
}

