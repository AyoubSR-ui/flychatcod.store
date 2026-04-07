import { Router } from "express";
import { db, pool, ordersTable, storesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";
import { sendVerificationCall, confirmVerificationOtp, generateElevenLabsAudio, triggerOrderConfirmationCall } from "../lib/voice-call.js";
import { saveCallerPhone, getVoiceStatus } from "../lib/voice-credits.js";

const router = Router();

// ─── GET /api/voice/status ────────────────────────────────────────────────────
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

// ─── POST /api/voice/verify-send ─────────────────────────────────────────────
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

// ─── POST /api/voice/verify-confirm ──────────────────────────────────────────
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
    await saveCallerPhone(storeId, phone);
    console.log(`[Voice] Caller phone ${phone} verified for store ${storeId}`);
    res.json({ success: true, phone });
  } catch (err) {
    console.error("[Voice] Verify confirm error:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── DELETE /api/voice/verify-confirm — remove caller phone ──────────────────
router.delete("/verify-confirm", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }
    await saveCallerPhone(storeId, "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /api/voice/twiml — called by Twilio when call connects ───────────────
router.get("/twiml", async (req, res) => {
  const { orderId, lang, script } = req.query as Record<string, string>;
  const language = (lang as "darija" | "french") || "darija";
  const twimlLang = language === "french" ? "fr-FR" : "ar-MA";
  const decodedScript = decodeURIComponent(script || "");

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
  if (ELEVENLABS_API_KEY && decodedScript) {
    await generateElevenLabsAudio(decodedScript, language).catch(() => null);
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${process.env.API_BASE_URL}/api/voice/keypress?orderId=${orderId}" method="POST" timeout="15">
    <Say language="${twimlLang}" voice="Polly.Zeina">${decodedScript}</Say>
    <Pause length="2"/>
    <Say language="${twimlLang}" voice="Polly.Zeina">${decodedScript}</Say>
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
      await pool.query(
        `UPDATE orders SET status = 'confirmed', confirmed_by_source = 'ai_call', updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
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
      await pool.query(
        `UPDATE orders SET status = 'cancelled', confirmed_by_source = 'ai_call', updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
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
  const { orderId } = req.query as Record<string, string>;
  const callStatus = req.body?.CallStatus;
  const callDuration = req.body?.CallDuration;
  console.log(`[Voice] Call status for order ${orderId}: ${callStatus}, duration: ${callDuration}s`);
  res.json({ received: true });
});

// ─── POST /api/voice/call-order/:id — manually trigger call ──────────────────
router.post("/call-order/:id", requireAuth, async (req, res) => {
  try {
    const storeId = req.user!.storeId;
    if (!storeId) { res.status(400).json({ error: "no_store" }); return; }

    // Fetch order with items
    const { rows } = await pool.query(
      `SELECT o.id, o.customer_phone, o.customer_name, o.wilaya, o.total, o.order_number, o.status,
              json_agg(json_build_object('name', oi.product_name, 'price', oi.price, 'quantity', oi.quantity)) as items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $1 AND o.store_id = $2
       GROUP BY o.id LIMIT 1`,
      [String(req.params.id), String(storeId)]
    );

    const order = rows[0];
    if (!order) { res.status(404).json({ error: "not_found", message: "Order not found" }); return; }

    // Get store name
    const [store] = await db.select({ name: storesTable.name })
      .from(storesTable).where(eq(storesTable.id, String(storeId))).limit(1);

    const firstItem = order.items?.find((i: any) => i.name);

    const success = await triggerOrderConfirmationCall({
      customerPhone: order.customer_phone,
      customerName: order.customer_name,
      storeName: store?.name || "Notre boutique",
      productName: firstItem?.name || "votre produit",
      wilaya: order.wilaya,
      price: String(Number(order.total).toLocaleString()),
      orderNumber: order.order_number,
      orderId: order.id,
      storeId: String(storeId),
      detectedLanguage: "darija",
    });

    if (success) {
      res.json({ success: true, message: "Call initiated successfully" });
    } else {
      res.status(500).json({ success: false, message: "Failed to initiate call — check voice configuration" });
    }
  } catch (err: any) {
    console.error("[Voice] Manual call error:", err);
    res.status(500).json({ error: "internal_error", message: err.message });
  }
});

export default router;