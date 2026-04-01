import { Router } from "express";
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { sendVerificationCall, confirmVerificationOtp, generateElevenLabsAudio } from "../lib/voice-call.js";
import { saveCallerPhone, getVoiceStatus } from "../lib/voice-credits.js";

const router = Router();

// ─── GET /api/voice/status — get voice credits status ─────────────────────────
router.get("/status", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.json({ eligible: false, callsRemaining: 0 }); return; }
    const status = await getVoiceStatus(storeId);
    res.json(status);
  } catch (err) {
    console.error("[Voice] Status error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /api/voice/verify-send — send OTP to verify caller phone ───────────
router.post("/verify-send", requireAuth, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) { res.status(400).json({ error: "phone required" }); return; }

    const formattedPhone = await sendVerificationCall(phone);
    if (!formattedPhone) {
      res.status(500).json({ error: "verification_failed", message: "Failed to send OTP. Check your Twilio configuration." });
      return;
    }

    res.json({ success: true, phone: formattedPhone });
  } catch (err) {
    console.error("[Voice] Verify send error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── POST /api/voice/verify-confirm — confirm OTP ─────────────────────────────
router.post("/verify-confirm", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    const { phone, code } = req.body;
    if (!phone || !code) { res.status(400).json({ error: "phone and code required" }); return; }

    const verified = await confirmVerificationOtp(phone, code);
    if (!verified) {
      res.status(400).json({ error: "invalid_otp", message: "Invalid or expired verification code." });
      return;
    }

    // Save verified caller phone to store
    await saveCallerPhone(storeId, phone);
    console.log(`[Voice] Caller phone ${phone} verified for store ${storeId}`);
    res.json({ success: true, phone });
  } catch (err) {
    console.error("[Voice] Verify confirm error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /api/voice/twiml — called by Twilio when call connects ───────────────
router.get("/twiml", async (req, res) => {
  const { orderId, lang, script } = req.query as Record<string, string>;
  const language = lang as "darija" | "french" || "darija";
  const twimlLang = language === "french" ? "fr-FR" : "ar-MA";

  // Try ElevenLabs first
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
  if (ELEVENLABS_API_KEY && script) {
    const audioBuffer = await generateElevenLabsAudio(decodeURIComponent(script), language);
    if (audioBuffer) {
      // Serve audio and use Twilio to play it
      const audioUrl = `${process.env.API_BASE_URL}/api/voice/audio/${orderId}`;
      // Store audio temporarily (in-memory for now)
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${process.env.API_BASE_URL}/api/voice/keypress?orderId=${orderId}" method="POST" timeout="15">
    <Say language="${twimlLang}" voice="Polly.Zeina">${decodeURIComponent(script)}</Say>
    <Pause length="2"/>
    <Say language="${twimlLang}" voice="Polly.Zeina">${decodeURIComponent(script)}</Say>
  </Gather>
  <Say language="fr-FR">Merci, nous vous rappellerons bientôt.</Say>
</Response>`;
      res.type("text/xml");
      res.send(twiml);
      return;
    }
  }

  // Fallback to Twilio TTS
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${process.env.API_BASE_URL}/api/voice/keypress?orderId=${orderId}" method="POST" timeout="15">
    <Say language="${twimlLang}" voice="Polly.Zeina">${decodeURIComponent(script || "")}</Say>
    <Pause length="2"/>
    <Say language="${twimlLang}" voice="Polly.Zeina">${decodeURIComponent(script || "")}</Say>
  </Gather>
  <Say language="fr-FR">Merci, nous vous rappellerons bientôt.</Say>
</Response>`;
  res.type("text/xml");
  res.send(twiml);
});

// ─── POST /api/voice/keypress — handle keypad input ──────────────────────────
router.post("/keypress", async (req, res) => {
  const { orderId } = req.query as Record<string, string>;
  const digit = req.body?.Digits;

  console.log(`[Voice] Keypress for order ${orderId}: digit=${digit}`);

  let twiml = "";

  if (digit === "1") {
    try {
      await db.update(ordersTable)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
      console.log(`[Voice] Order ${orderId} CONFIRMED via call`);
    } catch (err) {
      console.error("[Voice] Confirm failed:", err);
    }
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR">Parfait, votre commande est confirmée. Merci et bonne journée!</Say>
  <Hangup/>
</Response>`;

  } else if (digit === "2") {
    try {
      await db.update(ordersTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
      console.log(`[Voice] Order ${orderId} CANCELLED via call`);
    } catch (err) {
      console.error("[Voice] Cancel failed:", err);
    }
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR">Votre commande a été annulée. Merci et bonne journée!</Say>
  <Hangup/>
</Response>`;

  } else {
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR">Un agent va vous contacter très prochainement. Merci!</Say>
  <Hangup/>
</Response>`;
  }

  res.type("text/xml");
  res.send(twiml);
});

// ─── POST /api/voice/status — Twilio call status callback ────────────────────
router.post("/status", async (req, res) => {
  const { orderId, storeId } = req.query as Record<string, string>;
  const callStatus = req.body?.CallStatus;
  const callDuration = req.body?.CallDuration;
  console.log(`[Voice] Call status for order ${orderId}: ${callStatus}, duration: ${callDuration}s`);
  res.json({ received: true });
});

export default router;