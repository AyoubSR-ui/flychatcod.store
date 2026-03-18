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
  conversationFlowState?: string | null;
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

const ORDER_SUMMARY_FORMAT_PROMPT = `ORDER SUMMARY FORMATTING RULES (mandatory — override any default behavior):
When summarizing an order before asking the customer to confirm, you MUST use this exact structure:

[Introduction sentence]
[blank line]
[Details label]
[blank line]
- Field 1
- Field 2
...
[blank line]
[Confirmation question]

ENGLISH TEMPLATE:
Let's finalize your order.

Here are the details:

- Product: {product_name}
- Size/Variant: {variant}
- Quantity: {quantity}
- Name: {customer_name}
- Phone: {phone_number}
- Wilaya: {wilaya}
- Address: {address}

Is everything correct?

FRENCH TEMPLATE:
Finalisons votre commande.

Voici les détails :

- Produit : {product_name}
- Taille : {variant}
- Quantité : {quantity}
- Nom : {customer_name}
- Téléphone : {phone_number}
- Wilaya : {wilaya}
- Adresse : {address}

Est-ce que tout est correct ?

ARABIC/DARIJA TEMPLATE:
خلينا نأكد الطلب ديالك.

هادي التفاصيل:

- المنتج: {product_name}
- المقاس: {variant}
- الكمية: {quantity}
- الاسم: {customer_name}
- الهاتف: {phone_number}
- الولاية: {wilaya}
- العنوان: {address}

واش كلشي صحيح؟

STRICT FORMATTING RULES:
- NEVER put multiple fields on the same line (no "Size: 41 - Quantity: 1 - Name: Ayoub")
- ALWAYS put each field on its own separate line with a dash prefix
- ALWAYS include blank lines between sections (introduction / details label / fields / confirmation)
- ALWAYS end with a confirmation question
- If a field is missing or unknown, omit it entirely — do not include empty or placeholder lines
- Keep the exact same field order every time
- Use the appropriate language template based on the conversation language`;

const DARIJA_FEWSHOT_PROMPT = `DARIJA (Algerian Arabic dialect) UNDERSTANDING RULES:
You MUST understand and correctly respond to Algerian Darija. Below are vocabulary hints and conversation examples.

DARIJA VOCABULARY HINTS:
- "wach rak / wach rakom" = how are you / how are you (pl.)
- "labas / labas 3lik" = fine / I'm fine
- "nheb / bghit / nbghi" = I want / I would like
- "notlab / ndir commande" = to order / to place an order
- "baskat / waslat" = received / arrived (for deliveries)
- "mn 3andkom / 3andkum" = from you / from your store
- "sah / sahit / saha" = correct / that's right / thank you (after a service)
- "يعطيك الصحة / yatik saha" = thank you (lit. "God give you health") — polite appreciation after help
- "tamam / mzyan / waxha" = okay / good / alright
- "bghit ncanceli / bghit nalgi" = I want to cancel
- "rah mazal dispo / mazal kayn" = still available / still in stock
- "la3ziz / sidi / madame" = dear (polite address)
- "chhal / b'chhal / bchhal" = how much / at what price
- "3andi / 3ndi" = I have
- "ma3ndi / manich" = I don't have / I am not
- "kifach / kifa3 / kifah" = how / what way
- "diri / dir" = do / make (imperative)
- "raki / rak" = you are (f/m)
- "ntuma / nta / nti" = you (pl/m/f)

FEW-SHOT EXAMPLES (Darija → how you should respond):

Example 1 — Greeting in Darija:
Customer: "salam, wach rak?"
Assistant (Darija/AR): "وعليكم السلام! أنا بخير، شكراً. كيفاش نقدر نعاونك اليوم؟"

Example 2 — Order intent in Darija:
Customer: "nheb notlab pair de chaussures"
Assistant (Darija/AR): "بالتوفيق! أي مقاس تبغي؟ وكيفاش اسمك ورقم تيليفونك باش نكملو الطلب؟"

Example 3 — Order intent in French:
Customer: "je veux commander des chaussures taille 42"
Assistant (FR): "Parfait ! Pouvez-vous me donner votre nom, numéro de téléphone et wilaya de livraison ?"

Example 4 — Order intent in English:
Customer: "i want to order shoes size 41"
Assistant (EN): "Great! Could you share your name, phone number, and wilaya for delivery?"

Example 5 — Cancellation intent in Darija:
Customer: "bghit ncanceli commande dyali"
Assistant (Darija/AR): "واخا، راح نعاونك. عطيني رقم التيليفون اللي سجلتيه في الطلب باش نلقاه."

Example 6 — Post-cancellation thank you (CRITICAL — do NOT restart cancellation flow):
Customer: "يعطيك الصحة"
Assistant (Darija/AR): "وفيك البركة! إذا حتجت أي حاجة أخرى، أنا هنا."

Example 7 — Asking about availability in Darija:
Customer: "wach rah mazal dispo pointure 43?"
Assistant (Darija/AR): "ايه، المقاس 43 مازال متوفر! واش تبغي تطلب؟"

Example 8 — Price inquiry in Darija:
Customer: "bchhal les chaussures mn 3andkom?"
Assistant (Darija/AR): "السعر هو [السعر] دج مع التوصيل. واش تبغي تطلب؟"

Example 9 — Confirmation "sah" / "tamam":
Customer: "sah, kolchi mzyan"
[Note: This is order confirmation — mark canAutoCreate=true if all fields collected]
Assistant (Darija/AR): "مزيان! الطلب تسجل. فريقنا راح يتصل بيك قريباً لتأكيد."

Example 10 — Received delivery / feedback:
Customer: "baskat la commande, saha"
Assistant (Darija/AR): "الحمد لله وصلت بخير! يسعدنا خدمتك. إذا عندك أي سؤال، راسلنا."

Example 11 — After cancellation, customer starts a NEW order (CRITICAL — do NOT mix cancellation reply):
Customer: "راني حاب طلب من عندكم"
[Note: This is a fresh new-order intent after cancellation was completed. Never mention cancellation.]
Assistant (Darija/AR): "أهلاً! شنو المنتوج اللي تبغيه؟ عندنا [list products]. عطيني اسمك ورقم تيليفونك باش نكملو الطلب."

Example 12 — Product inquiry after cancellation (do NOT run cancellation lookup):
Customer: "ممكن نعرف المنتجات لي عندكم"
Assistant (Darija/AR): "ايه، عندنا: [list products]. واش تبغي تطلب واحد منهم؟"

Example 13 — New order intent in Darija Latin (do NOT run cancellation logic):
Customer: "nheb ncommande baskat"
[Note: "baskat" here means "just" or "simply" in Darija — not "received delivery". This is order intent.]
Assistant (Darija/AR): "مزيان! أي منتوج تبغي؟ عطيني التفاصيل ونكملو الطلب."

Example 14 — Cancellation intent with clear reference (use cancellation flow ONLY):
Customer: "حاب نلغي الطلب"
Assistant (Darija/AR): "واخا، راح نعاونك. عطيني رقم التيليفون اللي سجلتيه في الطلب."

Example 15 — Post-cancellation Darija thanks, then new order in same turn:
Customer: "يعطيك الصحة، وبغيت نطلب زوج أخرى"
[Note: First half is thanks, second half is new order. Reply warmly then pivot to order collection.]
Assistant (Darija/AR): "وفيك البركة! بكل سرور. أي منتوج تبغي وبأي مقاس؟"

IMPORTANT: When the customer writes in Darija (even mixed with French words), detect it as Arabic (ar) and reply in Darija/Arabic only. Do NOT switch to French or English.
ONE FLOW PER TURN: Never mix cancellation-related text with new-order or product-inquiry replies in the same message.`;

const DEFAULT_STORE_PROMPT = `You are a helpful COD (Cash on Delivery) sales assistant for an Algerian e-commerce store.

Your responsibilities:
- Greet the customer warmly — but only ONCE at the very start. Never repeat a greeting.
- Answer questions about products, pricing, delivery, availability, and order status.
- Guide the customer step by step to collect order details: product, variant, quantity, name, phone, wilaya, address.
- If the customer expresses intent to order, move straight to collecting missing details — do not re-greet.
- Once all required fields are collected, summarize the order using the ORDER SUMMARY FORMAT and ask the customer to confirm.
- After the customer confirms, tell them their order has been placed and is awaiting confirmation.
- If the customer asks to cancel, ask for their phone number to look up the order, then confirm cancellation.
- Ask only one clarifying question at a time when information is missing.`;

function buildFlowStateBlock(flowState: string | null | undefined): string | null {
  if (!flowState) return null;
  if (flowState === "order_created") {
    return `CURRENT CONVERSATION STATE (IMPORTANT):
- An order was just created successfully for this customer.
- The order flow is COMPLETE. Do NOT ask for order details again.
- If the customer sends a thank-you message (e.g. "يعطيك الصحة", "merci", "thank you", "saha"), reply warmly and briefly.
- Do NOT restart the order creation flow or ask about products/phone/address again.
- Handle any follow-up questions naturally (e.g. delivery time, order number queries).`;
  }
  if (flowState === "order_cancelled") {
    return `CURRENT CONVERSATION STATE (IMPORTANT):
- An order was just cancelled successfully for this customer.
- The cancellation flow is COMPLETE. Do NOT re-ask about cancellation.
- If the customer sends a thank-you message (e.g. "يعطيك الصحة", "merci", "saha"), reply warmly and briefly in Darija/French/English matching their language.
- Example Darija reply: "وفيك البركة! إذا حتجت أي حاجة أخرى، أنا هنا."
- Do NOT restart the cancellation flow.`;
  }
  if (flowState === "pending_cancel_choice") {
    return `CURRENT CONVERSATION STATE (IMPORTANT):
- Multiple cancellable orders were found for this customer and they need to specify which one to cancel.
- Ask the customer to confirm which order number they want to cancel (show the order numbers if you have them).
- Do NOT ask for their phone number again — it was already provided.`;
  }
  return null;
}

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
  const flowStateBlock = buildFlowStateBlock(params.conversationFlowState);

  const systemParts: string[] = [
    SAFETY_PROMPT,
    ORDER_SUMMARY_FORMAT_PROMPT,
    DARIJA_FEWSHOT_PROMPT,
    storeInstructions,
    languageBlock,
    `Store name: ${params.storeName}`,
    `Customer name: ${params.customerName || "Unknown"}`,
  ];

  if (flowStateBlock) {
    systemParts.push(flowStateBlock);
  }

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
- cancelIntent = true ONLY if the MOST RECENT customer messages clearly show cancellation intent for a NEW request
  - Do NOT set cancelIntent=true based on older messages if the conversation has moved on
  - If the last few customer messages are thank-you phrases ("يعطيك الصحة", "saha", "merci", "thank you"), cancelIntent=false
- cancelPhone = phone number to use for cancellation lookup (may differ from order phone)
- Extract phone numbers in any format the customer wrote
- Extract wilaya from Arabic, French, or Algerian dialect names
- If address is not given, set it to null (not required to block creation)

DARIJA NOTES:
- "bghit ncanceli / bghit nalgi / bghit nshri / nheb ncanceli" = cancel intent
- "sah / tamam / waxha / mzyan" after order summary = confirmation (canAutoCreate may be true)
- "يعطيك الصحة / yatik saha / saha / sahit / wafik el baraka / بارك الله فيك / شكرا" = thank-you phrase (NOT cancel intent, NOT order intent)
- "baskat / waslat / waslet" = received delivery (NOT cancel intent, NOT order intent)
- If the conversation has aiFlowState=order_created or order_cancelled and the last messages are only thanks/acknowledgements, set cancelIntent=false and canAutoCreate=false`;

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
