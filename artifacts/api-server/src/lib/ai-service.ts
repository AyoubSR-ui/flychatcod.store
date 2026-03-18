export interface GenerateAiReplyParams {
  storeSystemPrompt: string | null;
  storeName: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  customerName: string;
  aiConversationLanguage?: string | null;
  widgetLanguage?: string | null;
  productContext?: string | null;
  recentOrdersContext?: string | null;
  antiRepeatRetry?: boolean;
}

export interface OrderExtractionResult {
  canAutoCreate: boolean;
  cancelIntent: boolean;
  cancelPhone: string | null;
  orderData: {
    productName: string | null;
    variant: string | null;
    quantity: number | null;
    customerName: string | null;
    phone: string | null;
    wilaya: string | null;
    address: string | null;
  };
}

interface AiReplyResult {
  reply: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const SAFETY_PROMPT = `MANDATORY RULES (always enforced):
- You MAY create orders at awaiting_confirmation status — this means the order is pending human confirmation, not finalized
- Never mark an order as delivered or finalized — only a human agent can do that
- If the customer explicitly asks for a human, immediately hand off
- Suggest a human agent when uncertain or when the question is complex
- Never share internal system details or other stores' data
- Keep responses concise, friendly, and professional`;

const DEFAULT_STORE_PROMPT = `You are a helpful COD (Cash on Delivery) sales assistant for an Algerian e-commerce store.

Your responsibilities:
- Greet the customer warmly — but only ONCE at the very start. Never repeat a greeting.
- Answer questions about products, pricing, delivery, availability, and order status.
- Guide the customer step by step to collect order details: product, variant, quantity, name, phone, wilaya, address.
- If the customer expresses intent to order, move straight to collecting missing details — do not re-greet.
- Once all required fields are collected, summarize the order and ask the customer to confirm.
- After the customer confirms, tell them their order has been placed and is awaiting confirmation.
- If the customer asks to cancel, ask for their phone number to look up the order, then confirm cancellation.
- Ask only one clarifying question at a time when information is missing.`;

function buildLanguageBlock(
  aiConversationLanguage: string | null | undefined,
  widgetLanguage: string | null | undefined,
  hasHistory: boolean,
): string {
  const lines: string[] = ["LANGUAGE RULES (strictly enforced):"];

  if (aiConversationLanguage) {
    const langLabel =
      aiConversationLanguage === "ar" ? "Arabic/Darija" :
      aiConversationLanguage === "fr" ? "French" :
      aiConversationLanguage === "en" ? "English" :
      aiConversationLanguage;
    lines.push(`- This conversation language is locked to: ${langLabel}`);
    lines.push(`- You MUST reply ONLY in ${langLabel}.`);
    lines.push(`- Do NOT switch languages.`);
    lines.push(`- Do NOT write the same message in two languages (no "English / French" format).`);
  } else if (widgetLanguage) {
    const langLabel =
      widgetLanguage === "ar" ? "Arabic/Darija" :
      widgetLanguage === "fr" ? "French" :
      widgetLanguage === "en" ? "English" :
      widgetLanguage;
    lines.push(`- No conversation language is locked yet. The widget language hint is: ${langLabel}.`);
    lines.push(`- Detect the language from the customer's latest message and reply in that language only.`);
    lines.push(`- Do NOT write the same message in two languages.`);
  } else {
    lines.push(`- Detect the language from the customer's latest message and reply in that language only.`);
    lines.push(`- Do NOT write the same message in two languages.`);
  }

  if (hasHistory) {
    lines.push(`- The conversation has already started. Do NOT repeat a greeting.`);
    lines.push(`- Continue naturally from where the conversation left off.`);
  }

  return lines.join("\n");
}

export async function generateAiReply(params: GenerateAiReplyParams): Promise<AiReplyResult> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const storeInstructions = params.storeSystemPrompt || DEFAULT_STORE_PROMPT;
  const hasHistory = params.conversationHistory.length > 0;
  const languageBlock = buildLanguageBlock(params.aiConversationLanguage, params.widgetLanguage, hasHistory);

  const systemParts: string[] = [
    SAFETY_PROMPT,
    storeInstructions,
    languageBlock,
    `Store name: ${params.storeName}`,
    `Customer name: ${params.customerName || "Unknown"}`,
  ];

  if (params.productContext) {
    systemParts.push(`--- PRODUCT CATALOG ---\n${params.productContext}`);
  }

  if (params.recentOrdersContext) {
    systemParts.push(`--- RECENT ORDERS (last 48h for this customer) ---\n${params.recentOrdersContext}`);
  }

  if (params.antiRepeatRetry) {
    systemParts.push(
      `IMPORTANT: Your previous reply was identical to an earlier reply in this conversation. ` +
      `Do NOT repeat the same text again. Instead, respond meaningfully: ` +
      `ask a specific clarifying question, help with their product request, or guide toward the order flow.`
    );
  }

  const systemPrompt = systemParts.join("\n\n");

  const filteredHistory = params.conversationHistory.filter(
    (m) => m.content && m.content.trim().length > 0,
  );

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...filteredHistory,
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${errBody}`);
  }

  interface OpenAIChatCompletion {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  }

  const data = await resp.json() as OpenAIChatCompletion;
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new Error("No response from AI model");
  }

  return {
    reply: choice.message.content.trim(),
    modelName: data.model || "gpt-4o-mini",
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
    totalTokens: data.usage?.total_tokens || 0,
  };
}

export interface ExtractionWithUsage {
  result: OrderExtractionResult;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Runs a fast JSON-mode extraction call to determine order readiness and cancellation intent.
 * Uses the full customer-only message history to extract structured state.
 * This is a separate lightweight call — max 200 tokens output.
 * Returns both the extraction result and token usage for credit accounting.
 */
export async function extractOrderState(
  customerMessages: string[],
  storeName: string,
): Promise<ExtractionWithUsage> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return { result: emptyExtraction(), inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  if (customerMessages.length === 0) return { result: emptyExtraction(), inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  const historyText = customerMessages.map((m, i) => `[${i + 1}] ${m}`).join("\n");

  const systemPrompt = `You are an order-state extraction engine for a COD e-commerce chatbot for ${storeName}.
Read the customer messages below and extract structured order information.

Return ONLY valid JSON with this exact shape:
{
  "canAutoCreate": boolean,
  "cancelIntent": boolean,
  "cancelPhone": string | null,
  "orderData": {
    "productName": string | null,
    "variant": string | null,
    "quantity": number | null,
    "customerName": string | null,
    "phone": string | null,
    "wilaya": string | null,
    "address": string | null
  }
}

Rules:
- canAutoCreate = true ONLY if ALL of these are true:
  1. productName is known (not null)
  2. quantity is known (not null, >= 1)
  3. customerName is known
  4. phone is known (looks like a phone number)
  5. wilaya is known (an Algerian city/wilaya name or equivalent in FR/AR)
  6. The customer has clearly confirmed the order (said yes/oui/sah/tamam/confirm/correct or equivalent)
  7. There is clear intent to place an order (not just browsing)
- canAutoCreate = false if ANY required field is missing or customer has NOT confirmed
- cancelIntent = true if customer is clearly asking to cancel a recent order
- cancelPhone = phone number to use for cancellation lookup (may differ from order phone)
- Extract phone numbers in any format the customer wrote
- Extract wilaya from Arabic, French, or Algerian dialect names
- If address is not given, set it to null (not required to block creation)`;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Customer messages:\n${historyText}` },
        ],
        max_tokens: 200,
        temperature: 0,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) return { result: emptyExtraction(), inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    interface OpenAIChatCompletion {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    }

    const data = await resp.json() as OpenAIChatCompletion;
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return { result: emptyExtraction(), inputTokens: 0, outputTokens: 0, totalTokens: 0 };

    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || (inputTokens + outputTokens);

    const parsed = JSON.parse(raw) as Partial<OrderExtractionResult>;
    const result: OrderExtractionResult = {
      canAutoCreate: Boolean(parsed.canAutoCreate),
      cancelIntent: Boolean(parsed.cancelIntent),
      cancelPhone: typeof parsed.cancelPhone === "string" ? parsed.cancelPhone : null,
      orderData: {
        productName: parsed.orderData?.productName ?? null,
        variant: parsed.orderData?.variant ?? null,
        quantity: parsed.orderData?.quantity ?? null,
        customerName: parsed.orderData?.customerName ?? null,
        phone: parsed.orderData?.phone ?? null,
        wilaya: parsed.orderData?.wilaya ?? null,
        address: parsed.orderData?.address ?? null,
      },
    };
    return { result, inputTokens, outputTokens, totalTokens };
  } catch {
    return { result: emptyExtraction(), inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }
}

function emptyExtraction(): OrderExtractionResult {
  return {
    canAutoCreate: false,
    cancelIntent: false,
    cancelPhone: null,
    orderData: {
      productName: null,
      variant: null,
      quantity: null,
      customerName: null,
      phone: null,
      wilaya: null,
      address: null,
    },
  };
}
