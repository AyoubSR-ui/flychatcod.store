import { Router } from "express";
import { db, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { buildTwiML } from "../lib/voice-call.js";

const router = Router();

// ─── TwiML endpoint — Twilio calls this when call connects ───────────────────
router.get("/twiml", async (req, res) => {
  const { order, orderId, lang, script } = req.query as Record<string, string>;

  // Use ElevenLabs audio if available, otherwise Twilio TTS
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

  if (ELEVENLABS_API_KEY && script) {
    // Generate audio and serve it
    const audioUrl = `${process.env.API_BASE_URL}/api/voice/audio?script=${encodeURIComponent(script)}&lang=${lang}`;
    res.type("text/xml");
    res.send(buildTwiML(audioUrl, order));
  } else {
    // Fallback to Twilio TTS
    const language = lang === "french" ? "fr-FR" : "ar-MA";
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="${language}">${script || "Bonjour, veuillez confirmer votre commande."}</Say>
  <Gather numDigits="1" action="${process.env.API_BASE_URL}/api/voice/response?order=${order}&orderId=${orderId}" method="POST" timeout="10">
    <Pause length="1"/>
  </Gather>
</Response>`;
    res.type("text/xml");
    res.send(twiml);
  }
});

// ─── Handle keypad response ───────────────────────────────────────────────────
router.post("/response", async (req, res) => {
  const { order, orderId } = req.query as Record<string, string>;
  const digit = req.body?.Digits;

  console.log(`[Voice] Response for order ${order}: digit=${digit}`);

  let twiml = "";

  if (digit === "1") {
    // Confirm order
    try {
      await db.update(ordersTable)
        .set({ status: "confirmed", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
      console.log(`[Voice] Order ${order} CONFIRMED via call`);
    } catch (err) {
      console.error("[Voice] Failed to confirm order:", err);
    }

    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR">Merci, votre commande est confirmée. Bonne journée!</Say>
  <Hangup/>
</Response>`;

  } else if (digit === "2") {
    // Cancel order
    try {
      await db.update(ordersTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(ordersTable.id, orderId));
      console.log(`[Voice] Order ${order} CANCELLED via call`);
    } catch (err) {
      console.error("[Voice] Failed to cancel order:", err);
    }

    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR">Votre commande a été annulée. Merci et bonne journée!</Say>
  <Hangup/>
</Response>`;

  } else {
    // Question — transfer to agent or send message
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="fr-FR">Un agent va vous contacter bientôt. Merci!</Say>
  <Hangup/>
</Response>`;
  }

  res.type("text/xml");
  res.send(twiml);
});

// ─── Call status callback ─────────────────────────────────────────────────────
router.post("/status", async (req, res) => {
  const { orderId } = req.query as Record<string, string>;
  const status = req.body?.CallStatus;
  console.log(`[Voice] Call status for order ${orderId}: ${status}`);
  res.json({ received: true });
});

export default router;