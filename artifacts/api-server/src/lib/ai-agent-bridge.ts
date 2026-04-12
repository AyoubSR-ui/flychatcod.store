import { db, pool, conversationsTable, messagesTable, ordersTable, orderItemsTable, storesTable } from "@workspace/db";
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

interface UpdateData {
  shippingOption?: string | null;
  address?: string | null;
  wilaya?: string | null;
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
    type: "create_order" | "cancel_order" | "update_order" | "none";
    customerName?: string;
    customerPhone?: string;
    wilaya?: string;
    address?: string;
    shippingOption?: string;
    updateData?: UpdateData;
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
  if (!AGENT_URL) throw new Error("[AI Bridge] AI_AGENT_URL environment variable is not set.");
  const res = await fetch(`${AGENT_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-agent-secret": AGENT_SECRET },
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
  return recentReplies.some((r) => r.trim().toLowerCase() === newReply.trim().toLowerCase());
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
    if (conversationBatch.has(conversationId)) clearTimeout(conversationBatch.get(conversationId)!.timer);
    const timer = setTimeout(() => { conversationBatch.delete(conversationId); resolve(); }, 3000);
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
      .select().from(conversationsTable)
      .where(eq(conversationsTable.id, conversationId)).limit(1);
    if (!conv || conv.aiMode !== "ai_autopilot") return;

    const history = await db
      .select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conversationId))
      .orderBy(messagesTable.createdAt);

    const agentHistory: AgentMessage[] = history.map((m) => ({
      role: (m.sender === "customer" ? "customer" : m.sender === "agent" ? "agent" : "bot") as AgentMessage["role"],
      content: m.content ?? "",
    }));

    const recentAiReplies = history
      .filter((m) => m.sender === "bot" && (m.metadata as Record<string, unknown> | null)?.aiGenerated)
      .slice(-3).map((m) => m.content ?? "");

    // ── Fetch shipping options ─────────────────────────────────────────────────
    const { rows: shippingRows } = await pool.query(
      `SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`, [storeId]
    );
    const shippingOptions = shippingRows[0]?.shipping_options ?? undefined;

    const agentResponse = await callAiAgent({
      conversationId, storeId, storeName, aiSystemPrompt,
      history: agentHistory, products, recentOrders,
      aiFlowState: conv.aiFlowState ?? undefined,
      detectedLanguage: conv.aiConversationLanguage ?? undefined,
      shippingOptions,
    });

    let { reply, detectedLanguage, action } = agentResponse;

    // ── Debug: log raw agent action ───────────────────────────────────────────
    if (action.type !== "none") {
      console.log(`[AI Bridge] Agent action received:`, JSON.stringify({
        type: action.type,
        wilaya: action.wilaya,
        shippingOption: action.shippingOption,
        customerPhone: action.customerPhone,
        customerName: action.customerName,
        itemCount: action.items?.length ?? 0,
      }));
    }

    if (isRepetitive(reply, recentAiReplies)) {
      const retryResponse = await callAiAgent({
        conversationId, storeId, storeName,
        aiSystemPrompt: (aiSystemPrompt || "") + "\n\nIMPORTANT: Your last reply was repetitive. Rephrase completely.",
        history: agentHistory, products, recentOrders,
        aiFlowState: conv.aiFlowState ?? undefined, detectedLanguage,
      });
      reply = retryResponse.reply;
      action = retryResponse.action;
    }

    if (!conv.aiConversationLanguage && detectedLanguage) {
      await db.update(conversationsTable)
        .set({ aiConversationLanguage: detectedLanguage })
        .where(eq(conversationsTable.id, conversationId));
    }

    const replyMsgId = generateId("msg");
    await db.insert(messagesTable).values({
      id: replyMsgId, conversationId, content: reply,
      sender: "bot", metadata: { aiGenerated: true }, createdAt: new Date(),
    });

    emitNewMessage(conversationId, storeId, replyMsgId, reply);
    await consumeCredits();

    // ── Order action handler ──────────────────────────────────────────────────
    if (action.type === "create_order") {
      if (conv.aiFlowState === "order_created") {
        const [existingOrder] = await db
          .select({ id: ordersTable.id, status: ordersTable.status, customerPhone: ordersTable.customerPhone })
          .from(ordersTable)
          .where(and(eq(ordersTable.conversationId, conversationId), eq(ordersTable.createdBySource, "ai")))
          .orderBy(desc(ordersTable.createdAt)).limit(1);

        const activeStatuses = ["new", "awaiting_confirmation", "confirmed"];
        const isSamePhone = existingOrder?.customerPhone === action.customerPhone;

        if (existingOrder && activeStatuses.includes(existingOrder.status) && isSamePhone) {
          console.log(`[AI Bridge] Active order exists for conv ${conversationId} — skipping duplicate`);
        } else {
          console.log(`[AI Bridge] Resetting aiFlowState — new order allowed for conv ${conversationId}`);
          await db.update(conversationsTable).set({ aiFlowState: null }).where(eq(conversationsTable.id, conversationId));
          await executeCreateOrderSilent(conversationId, storeId, conv.customerId, action, detectedLanguage);
        }
      } else {
        await executeCreateOrderSilent(conversationId, storeId, conv.customerId, action, detectedLanguage);
      }
    } else if (action.type === "cancel_order" && action.customerPhone) {
      await executeCancelOrderSilent(conversationId, storeId, action.customerPhone);
    } else if (action.type === "update_order" && action.updateData) {
      await executeUpdateOrderSilent(conversationId, storeId, action.customerPhone, action.updateData);
    }

  } catch (err) {
    console.error("[AI Bridge] callAiBridge failed:", err);
  } finally {
    aiReplyInFlight.delete(messageId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// WILAYA NORMALIZATION
// ── Darija/Arabic → French/Official wilaya names ──────────────────────────────
const WILAYA_ALIASES: Record<string, string> = {
  "wahran": "Oran", "ouahran": "Oran",
  "dzayer": "Alger", "dzair": "Alger", "el djazair": "Alger",
  "qsantina": "Constantine", "ksantina": "Constantine", "casantina": "Constantine",
  "3annaba": "Annaba", "3naba": "Annaba",
  "setif": "Sétif", "stif": "Sétif",
  "tlemcen": "Tlemcen", "tilimsan": "Tlemcen",
  "batna": "Batna",
  "sidi bel abbes": "Sidi Bel Abbès", "sba": "Sidi Bel Abbès",
  "biskra": "Biskra",
  "blida": "Blida", "boufarik": "Blida",
  "bejaia": "Béjaïa", "bgayet": "Béjaïa", "bgayette": "Béjaïa",
  "tizi ouzou": "Tizi Ouzou", "tizi wezzu": "Tizi Ouzou",
  "msila": "M'Sila", "m'sila": "M'Sila",
  "mostaganem": "Mostaganem", "musteghanem": "Mostaganem",
  "chlef": "Chlef", "chelef": "Chlef",
  "tiaret": "Tiaret", "tihert": "Tiaret",
  "bechar": "Béchar", "bashar": "Béchar",
  "ouargla": "Ouargla", "wargla": "Ouargla", "wergla": "Ouargla",
  "ghardaia": "Ghardaïa", "ghardaya": "Ghardaïa",
  "laghouat": "Laghouat", "leghouat": "Laghouat",
  "djelfa": "Djelfa", "jalfa": "Djelfa",
  "medea": "Médéa", "medya": "Médéa",
  "bouira": "Bouira", "bwira": "Bouira",
  "boumerdes": "Boumerdès", "bumerdes": "Boumerdès",
  "tipaza": "Tipaza", "tipasa": "Tipaza",
  "ain defla": "Aïn Defla",
  "ain temouchent": "Aïn Témouchent",
  "relizane": "Relizane", "ghilizane": "Relizane",
  "mascara": "Mascara",
  "saida": "Saïda",
  "naama": "Naâma",
  "el bayadh": "El Bayadh",
  "adrar": "Adrar",
  "tamanrasset": "Tamanrasset", "tamenrasset": "Tamanrasset",
  "illizi": "Illizi",
  "tindouf": "Tindouf",
  "khenchela": "Khenchela",
  "souk ahras": "Souk Ahras",
  "tebessa": "Tébessa", "tbessa": "Tébessa",
  "oum el bouaghi": "Oum El Bouaghi",
  "bordj bou arreridj": "Bordj Bou Arréridj", "bba": "Bordj Bou Arréridj",
  "mila": "Mila",
  "jijel": "Jijel",
  "skikda": "Skikda",
  "guelma": "Guelma",
  "el tarf": "El Tarf",
  "el oued": "El Oued", "l oued": "El Oued",
  "ouled djellal": "Ouled Djellal",
  "touggourt": "Touggourt",
  "in salah": "In Salah", "in guezzam": "In Guezzam",
};

/**
 * Strip accents: "Béjaïa" → "bejaia", "Sétif" → "setif"
 * Allows matching accented DB keys against plain agent output
 */
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeWilaya(wilaya: string): string {
  const lower = wilaya.toLowerCase().trim();
  return WILAYA_ALIASES[lower] || wilaya;
}

/**
 * Find the matching key in wilayaPrices for a given wilaya string.
 * Tries 4 strategies in order:
 *   1. Exact match (case-insensitive, after alias resolution)
 *   2. Accent-stripped exact match
 *   3. Substring match (key contains wilaya or wilaya contains key)
 *   4. Accent-stripped substring match
 */
function findWilayaKey(wilayaPrices: Record<string, any>, rawWilaya: string): string | undefined {
  const normalized = normalizeWilaya(rawWilaya);         // e.g. "Béjaïa"
  const normalizedLow = normalized.toLowerCase();         // "béjaïa"
  const rawLow = rawWilaya.toLowerCase().trim();          // "bgayet"
  const strippedNorm = stripAccents(normalizedLow);       // "bejaia"
  const strippedRaw = stripAccents(rawLow);               // "bgayet"

  const keys = Object.keys(wilayaPrices);

  // Strategy 1: exact match on normalized or raw
  let found = keys.find(k => {
    const kl = k.toLowerCase();
    return kl === normalizedLow || kl === rawLow;
  });
  if (found) return found;

  // Strategy 2: accent-stripped exact match
  found = keys.find(k => {
    const kStripped = stripAccents(k.toLowerCase());
    return kStripped === strippedNorm || kStripped === strippedRaw;
  });
  if (found) return found;

  // Strategy 3: substring match (original)
  found = keys.find(k => {
    const kl = k.toLowerCase();
    return kl.includes(normalizedLow) || normalizedLow.includes(kl) ||
           kl.includes(rawLow) || rawLow.includes(kl);
  });
  if (found) return found;

  // Strategy 4: accent-stripped substring match
  found = keys.find(k => {
    const kStripped = stripAccents(k.toLowerCase());
    return kStripped.includes(strippedNorm) || strippedNorm.includes(kStripped) ||
           kStripped.includes(strippedRaw) || strippedRaw.includes(kStripped);
  });
  return found;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE CREATE ORDER
// ═══════════════════════════════════════════════════════════════════════════════
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
    const itemsTotal = (action.items ?? []).reduce((sum, item) => sum + item.price * item.quantity, 0);

    // FIX: Default shippingOption to "home_delivery" if agent didn't return one
    const shippingOption = action.shippingOption || "home_delivery";

    // ── Calculate shipping fee ─────────────────────────────────────────────────
    let shippingPrice = 0;
    try {
      const { rows: storeRows } = await pool.query(
        `SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`, [storeId]
      );
      const shippingOptions = storeRows[0]?.shipping_options;

      if (shippingOptions) {
        const wilayaPrices = shippingOptions.wilayaPrices || {};
        const wilayaKey = findWilayaKey(wilayaPrices, action.wilaya!);

        // ── Debug log: shows exactly what matched (or didn't) ─────────────────
        console.log(`[AI Bridge] shippingCalc:`, JSON.stringify({
          rawWilaya: action.wilaya,
          normalizedWilaya: normalizeWilaya(action.wilaya!),
          wilayaKeyFound: wilayaKey ?? "NOT FOUND",
          shippingOption,
          availableKeys: Object.keys(wilayaPrices),
        }));

        if (wilayaKey) {
          shippingPrice = shippingOption === "pickup"
            ? Number(wilayaPrices[wilayaKey]?.pickup || 0)
            : Number(wilayaPrices[wilayaKey]?.home || 0);
        } else {
          console.warn(`[AI Bridge] Wilaya "${action.wilaya}" not found in wilayaPrices — shippingFee will be 0`);
        }
      } else {
        console.warn(`[AI Bridge] No shipping_options configured for store ${storeId}`);
      }
    } catch (e) {
      console.error("[AI Bridge] Shipping calc failed:", e);
    }

    const total = (itemsTotal + shippingPrice).toFixed(2);

    console.log(`[AI Bridge] Creating order — items: ${itemsTotal}, shipping: ${shippingPrice}, total: ${total}, option: ${shippingOption}`);

    await db.insert(ordersTable).values({
      id: orderId, storeId, conversationId,
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
      shippingOption,                        // FIX: always set, never null
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

    await db.update(conversationsTable)
      .set({ aiFlowState: "order_created", updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));

    console.log(`[AI Bridge] Order ${orderNumber} created — conv ${conversationId}`);

    // ── Voice confirmation call ────────────────────────────────────────────────
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
        orderNumber, orderId, storeId, detectedLanguage,
      });
    } catch (callErr) {
      console.error("[Voice] Call trigger failed:", callErr);
    }

    // ── Push to Shopify ───────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE CANCEL ORDER
// ═══════════════════════════════════════════════════════════════════════════════
async function executeCancelOrderSilent(
  conversationId: string,
  storeId: string,
  customerPhone: string,
): Promise<void> {
  try {
    const [targetOrder] = await db.select().from(ordersTable)
      .where(and(
        eq(ordersTable.storeId, storeId),
        eq(ordersTable.customerPhone, customerPhone),
        inArray(ordersTable.status, ["new", "awaiting_confirmation", "confirmed"]),
      ))
      .orderBy(desc(ordersTable.createdAt)).limit(1);

    if (!targetOrder) return;

    await db.update(ordersTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(ordersTable.id, targetOrder.id));

    await db.update(conversationsTable)
      .set({ aiFlowState: "order_cancelled", updatedAt: new Date() })
      .where(eq(conversationsTable.id, conversationId));

    console.log(`[AI Bridge] Order ${targetOrder.orderNumber} cancelled for conv ${conversationId}`);
  } catch (err) {
    console.error("[AI Bridge] Silent cancellation failed:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE UPDATE ORDER
// ═══════════════════════════════════════════════════════════════════════════════
async function executeUpdateOrderSilent(
  conversationId: string,
  storeId: string,
  customerPhone: string | undefined,
  updateData: UpdateData,
): Promise<void> {
  try {
    const conditions: ReturnType<typeof eq>[] = [
      eq(ordersTable.storeId, storeId),
      eq(ordersTable.createdBySource, "ai"),
    ];
    if (conversationId) conditions.push(eq(ordersTable.conversationId, conversationId));
    else if (customerPhone) conditions.push(eq(ordersTable.customerPhone, customerPhone));

    const [existingOrder] = await db.select().from(ordersTable)
      .where(and(...conditions))
      .orderBy(desc(ordersTable.createdAt)).limit(1);

    if (!existingOrder) {
      console.log(`[AI Bridge] No order found to update for conv ${conversationId}`);
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (updateData.shippingOption) updates.shippingOption = updateData.shippingOption;
    if (updateData.address) updates.address = updateData.address;
    if (updateData.wilaya) updates.wilaya = updateData.wilaya;

    // ── Recalculate shipping fee if option or wilaya changed ──────────────────
    if (updateData.shippingOption || updateData.wilaya) {
      try {
        const { rows: storeRows } = await pool.query(
          `SELECT shipping_options FROM stores WHERE id = $1 LIMIT 1`, [storeId]
        );
        const shippingOptions = storeRows[0]?.shipping_options;
        if (shippingOptions) {
          const wilaya = updateData.wilaya || existingOrder.wilaya;
          const opt = updateData.shippingOption || (existingOrder as any).shippingOption || "home_delivery";
          const wilayaPrices = shippingOptions.wilayaPrices || {};
          const wilayaKey = findWilayaKey(wilayaPrices, wilaya);

          console.log(`[AI Bridge] updateOrder shippingCalc:`, JSON.stringify({
            wilaya, opt, wilayaKeyFound: wilayaKey ?? "NOT FOUND",
          }));

          if (wilayaKey) {
            const newShippingFee = opt === "pickup"
              ? Number(wilayaPrices[wilayaKey]?.pickup || 0)
              : Number(wilayaPrices[wilayaKey]?.home || 0);
            updates.shippingFee = String(newShippingFee);
            const items = await db.select().from(orderItemsTable)
              .where(eq(orderItemsTable.orderId, existingOrder.id));
            const itemsTotal = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
            updates.total = String(itemsTotal + newShippingFee);
          }
        }
      } catch (e) {
        console.error("[AI Bridge] Update shipping calc failed:", e);
      }
    }

    await db.update(ordersTable)
      .set(updates as any)
      .where(eq(ordersTable.id, existingOrder.id));

    console.log(`[AI Bridge] Order ${existingOrder.orderNumber} updated — ${JSON.stringify(updateData)}`);
  } catch (err) {
    console.error("[AI Bridge] Silent order update failed:", err);
  }
}