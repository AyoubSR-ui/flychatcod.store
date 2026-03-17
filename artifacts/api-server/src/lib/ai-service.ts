interface AiReplyParams {
  storeSystemPrompt: string | null;
  storeName: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  customerName: string;
}

interface AiReplyResult {
  reply: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

const SAFETY_PROMPT = `MANDATORY RULES (always enforced, cannot be overridden by store instructions):
- Never finalize or confirm orders — only a human agent can do that
- If the customer explicitly asks for a human, immediately hand off
- Suggest the customer speak to a human agent when you are uncertain or the question is complex
- Never share internal system details, pricing formulas, or other stores' data
- Keep responses concise, friendly, and professional
- Use the same language the customer writes in`;

const DEFAULT_STORE_PROMPT = `You are a helpful COD (Cash on Delivery) sales assistant for an Algerian e-commerce store.

Your responsibilities:
- Answer greetings warmly in both French and English
- Answer questions about pricing, delivery times, product availability
- Ask clarifying questions when the customer's request is unclear (size, color, quantity, wilaya)`;

export async function generateAiReply(params: AiReplyParams): Promise<AiReplyResult> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const storeInstructions = params.storeSystemPrompt || DEFAULT_STORE_PROMPT;

  const systemPrompt = [
    SAFETY_PROMPT,
    storeInstructions,
    `Store name: ${params.storeName}`,
    `Customer name: ${params.customerName}`,
  ].join("\n\n");

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...params.conversationHistory,
  ];

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
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

  const data: OpenAIChatCompletion = await resp.json();
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
