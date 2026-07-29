import twilio from "twilio";
import { getVoiceStatus, consumeVoiceCall, getCallerPhone } from "./voice-credits.js";
import { pool } from "@workspace/db";
import { logOrderEvent } from "./order-events.js";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const API_BASE_URL = process.env.API_BASE_URL || "https://zealous-nature-production-771f.up.railway.app";

// ─── Build call script ────────────────────────────────────────────────────────
function buildCallScript(params: {
  language: "darija" | "french";
  customerName: string;
  storeName: string;
  productName: string;
  wilaya: string;
  price: string;
  orderNumber: string;
}): string {
  const { language, customerName, storeName, productName, wilaya, price, orderNumber } = params;

  if (language === "darija") {
    return `Salam ${customerName}, ` +
      `ana men ${storeName}. ` +
      `Rak dar commande ${productName} ` +
      `b ${price} dinar ` +
      `l wilaya ${wilaya}. ` +
      `Ghadi n2akdoulak: ` +
      `Appuyer 1 pour confirmer, ` +
      `Appuyer 2 pour annuler, ` +
      `Appuyer 3 ila 3andek su2al.`;
  }

  return `Bonjour ${customerName}, ` +
    `je vous appelle de la part de ${storeName}. ` +
    `Vous avez commandé ${productName} ` +
    `pour ${price} dinars ` +
    `livraison à ${wilaya}. ` +
    `Appuyez sur 1 pour confirmer, ` +
    `sur 2 pour annuler, ` +
    `ou sur 3 si vous avez une question.`;
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────
export async function generateElevenLabsAudio(text: string, language: "darija" | "french"): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) return null;

  const voiceId = language === "darija"
    ? process.env.ELEVENLABS_DARIJA_VOICE_ID || "pNInz6obpgDQGcFmaJgB"
    : process.env.ELEVENLABS_FRENCH_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ─── Main trigger ─────────────────────────────────────────────────────────────
export interface CallOrderParams {
  customerPhone: string;
  customerName: string;
  storeName: string;
  productName: string;
  wilaya: string;
  price: string;
  orderNumber: string;
  orderId: string;
  storeId: string;
  detectedLanguage?: string;
}

export async function triggerOrderConfirmationCall(params: CallOrderParams): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.warn("[Voice] Twilio not configured — skipping call");
    return false;
  }

  try {
    // Check voice credits
    const status = await getVoiceStatus(params.storeId);
    if (!status.eligible || status.callsRemaining <= 0) {
      console.warn(`[Voice] No voice credits for store ${params.storeId} — skipping call`);
      return false;
    }

    // Get caller phone (store owner's verified number)
    const callerPhone = status.callerPhone;
    if (!callerPhone) {
      console.warn(`[Voice] No caller phone set for store ${params.storeId} — skipping call`);
      return false;
    }

    const language: "darija" | "french" = params.detectedLanguage === "fr" ? "french" : "darija";
    const script = buildCallScript({
      language,
      customerName: params.customerName,
      storeName: params.storeName,
      productName: params.productName,
      wilaya: params.wilaya,
      price: params.price,
      orderNumber: params.orderNumber,
    });

    // Format customer phone
    let phone = params.customerPhone.replace(/\s/g, "").replace(/-/g, "");
    if (phone.startsWith("0")) phone = "+213" + phone.slice(1);
    if (!phone.startsWith("+")) phone = "+213" + phone;

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    const call = await client.calls.create({
      to: phone,
      from: callerPhone,
      url: `${API_BASE_URL}/api/voice/twiml?orderId=${params.orderId}&lang=${language}&script=${encodeURIComponent(script)}`,
      statusCallback: `${API_BASE_URL}/api/voice/status?orderId=${params.orderId}&storeId=${params.storeId}`,
      statusCallbackMethod: "POST",
      timeout: 30,
      timeLimit: 180, // 3 min max
    });

    console.log(`[Voice] Call initiated: ${call.sid} to ${phone} for order ${params.orderNumber}`);

    // Consume one call credit
    await consumeVoiceCall(params.storeId);

    // Save call SID to order and mark it as awaiting the customer's self-confirmation response
    const { rows: priorRows } = await pool.query(`SELECT status FROM orders WHERE id = $1 LIMIT 1`, [params.orderId]).catch(() => ({ rows: [] as any[] }));
    const priorStatus = priorRows[0]?.status ?? null;
    await pool.query(
      `UPDATE orders SET voice_call_sid = $1, status = 'self_confirmation', updated_at = NOW() WHERE id = $2`,
      [call.sid, params.orderId]
    ).catch(() => {});
    if (priorStatus && priorStatus !== "self_confirmation") {
      logOrderEvent({ orderId: params.orderId, eventType: "status_change", fromStatus: priorStatus, toStatus: "self_confirmation", createdBy: "AI Call" })
        .catch(err => console.error("[Voice] Failed to log status_change event:", err));
    }

    return true;
  } catch (err) {
    console.error("[Voice] Call failed:", err);
    return false;
  }
}

// ─── Verify caller phone via OTP ──────────────────────────────────────────────
export async function sendVerificationCall(phone: string): Promise<string | null> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;

  try {
    let formatted = phone.replace(/\s/g, "").replace(/-/g, "");
    if (formatted.startsWith("0")) formatted = "+213" + formatted.slice(1);
    if (!formatted.startsWith("+")) formatted = "+213" + formatted;

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    // Use Twilio Verify service for OTP
    const VERIFY_SID = process.env.TWILIO_VERIFY_SID || "";
    if (VERIFY_SID) {
      await client.verify.v2.services(VERIFY_SID).verifications.create({
        to: formatted,
        channel: "sms",
      });
      return formatted;
    }

    return null;
  } catch (err) {
    console.error("[Voice] Verification failed:", err);
    return null;
  }
}

export async function confirmVerificationOtp(phone: string, code: string): Promise<boolean> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return false;

  try {
    const VERIFY_SID = process.env.TWILIO_VERIFY_SID || "";
    if (!VERIFY_SID) return false;

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const result = await client.verify.v2.services(VERIFY_SID).verificationChecks.create({
      to: phone,
      code,
    });

    return result.status === "approved";
  } catch (err) {
    console.error("[Voice] OTP confirmation failed:", err);
    return false;
  }
}