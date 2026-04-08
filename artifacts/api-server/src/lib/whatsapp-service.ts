const WA_API_VERSION = "v19.0";
const WA_BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  text?: { body: string };
  type: string;
  referral?: {
    source_url?: string;
    source_type?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    image_url?: string;
    video_url?: string;
    ctwa_clid?: string;
  };
  context?: {
    referred_product?: {
      catalog_id?: string;
      product_retailer_id?: string;
    };
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { phone_number_id: string; display_phone_number: string };
        messages?: WhatsAppMessage[];
        statuses?: Array<{ id: string; status: string; timestamp: string }>;
      };
      field: string;
    }>;
  }>;
}

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<boolean> {
  try {
    const res = await fetch(`${WA_BASE_URL}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to.replace(/\D/g, ""),
        type: "text",
        text: { body: text },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`[WhatsApp] Send failed: ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[WhatsApp] Send error:", err);
    return false;
  }
}

export function parseWhatsAppWebhook(body: WhatsAppWebhookPayload): Array<{
  phoneNumberId: string;
  from: string;
  messageId: string;
  text: string;
  timestamp: Date;
  adRef?: string | null;
}> {
  const results = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value.messages) continue;
      const phoneNumberId = value.metadata.phone_number_id;
      for (const msg of value.messages) {
        if (msg.type !== "text" || !msg.text?.body) continue;
        // Extract ad referral — WhatsApp sends referral.source_id or ctwa_clid
        const adRef = msg.referral?.source_id || msg.referral?.ctwa_clid || null;
        results.push({
          phoneNumberId,
          from: msg.from,
          messageId: msg.id,
          text: msg.text.body,
          timestamp: new Date(parseInt(msg.timestamp) * 1000),
          adRef,
        });
      }
    }
  }
  return results;
}