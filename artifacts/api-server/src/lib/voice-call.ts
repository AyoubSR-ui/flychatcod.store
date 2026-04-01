import twilio from "twilio";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const API_BASE_URL = process.env.API_BASE_URL || "https://zealous-nature-production-771f.up.railway.app";

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────
async function generateAudio(text: string, language: "darija" | "french"): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) return null;

  // Use different voice IDs for Darija vs French
  const voiceId = language === "darija"
    ? process.env.ELEVENLABS_DARIJA_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" // default Rachel
    : process.env.ELEVENLABS_FRENCH_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      console.error("[Voice] ElevenLabs error:", await res.text());
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[Voice] ElevenLabs TTS error:", err);
    return null;
  }
}

// ─── Build call script ────────────────────────────────────────────────────────
function buildCallScript(params: {
  language: "darija" | "french";
  customerName: string;
  storeName: string;
  agentName: string;
  productName: string;
  wilaya: string;
  price: string;
  orderNumber: string;
}): string {
  const { language, customerName, storeName, agentName, productName, wilaya, price, orderNumber } = params;

  if (language === "darija") {
    return `Salam ${customerName}, ana ${agentName} men ${storeName}. ` +
      `Rak dar commande numero ${orderNumber} ` +
      `l produit ${productName} ` +
      `l wilaya ${wilaya} ` +
      `b ${price} دينار. ` +
      `Appuyer 1 bach t2akked l commande. ` +
      `Appuyer 2 bach tannuli. ` +
      `Appuyer 3 ila 3andek su2al.`;
  }

  return `Bonjour ${customerName}, je suis ${agentName} de ${storeName}. ` +
    `Vous avez passé une commande numéro ${orderNumber} ` +
    `pour le produit ${productName} ` +
    `à la wilaya ${wilaya} ` +
    `pour un montant de ${price} dinars. ` +
    `Appuyez sur 1 pour confirmer votre commande. ` +
    `Appuyez sur 2 pour annuler. ` +
    `Appuyez sur 3 si vous avez une question.`;
}

// ─── Twilio TwiML for keypad response ────────────────────────────────────────
export function buildTwiML(audioUrl: string, orderNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather numDigits="1" action="${API_BASE_URL}/api/voice/response?order=${orderNumber}" method="POST" timeout="10">
    <Pause length="1"/>
  </Gather>
  <Say language="fr-FR">Nous n'avons pas reçu votre réponse. Nous vous rappellerons bientôt.</Say>
</Response>`;
}

// ─── Main: trigger confirmation call ─────────────────────────────────────────
export interface CallOrderParams {
  customerPhone: string;
  customerName: string;
  storeName: string;
  agentName: string;
  productName: string;
  wilaya: string;
  price: string;
  orderNumber: string;
  orderId: string;
  detectedLanguage?: string;
}

export async function triggerOrderConfirmationCall(params: CallOrderParams): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.warn("[Voice] Twilio not configured — skipping call");
    return false;
  }

  try {
    const language: "darija" | "french" = params.detectedLanguage === "fr" ? "french" : "darija";
    const script = buildCallScript({
      language,
      customerName: params.customerName,
      storeName: params.storeName,
      agentName: params.agentName,
      productName: params.productName,
      wilaya: params.wilaya,
      price: params.price,
      orderNumber: params.orderNumber,
    });

    console.log(`[Voice] Initiating call to ${params.customerPhone} for order ${params.orderNumber}`);
    console.log(`[Voice] Script (${language}): ${script}`);

    // Format phone number — add country code if needed
    let phone = params.customerPhone.replace(/\s/g, "");
    if (phone.startsWith("0")) phone = "+213" + phone.slice(1); // Algeria
    if (!phone.startsWith("+")) phone = "+213" + phone;

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    // Use TwiML URL endpoint for the call
    const call = await client.calls.create({
      to: phone,
      from: TWILIO_PHONE_NUMBER,
      url: `${API_BASE_URL}/api/voice/twiml?order=${params.orderNumber}&orderId=${params.orderId}&lang=${language}&script=${encodeURIComponent(script)}`,
      statusCallback: `${API_BASE_URL}/api/voice/status?orderId=${params.orderId}`,
      statusCallbackMethod: "POST",
    });

    console.log(`[Voice] Call initiated: ${call.sid} to ${phone}`);
    return true;
  } catch (err) {
    console.error("[Voice] Call failed:", err);
    return false;
  }
}