// WhatsApp Cloud API (Meta) — replaces Twilio
// All existing code imports sendWhatsAppMessage from this file, so the
// interface stays the same: sendWhatsAppMessage(to, body) → messageId | null

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<string | null> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.warn("WhatsApp Cloud API not configured, skipping message");
    return null;
  }

  // Normalize phone number: ensure it starts with + and strip any spaces/dashes
  const cleanTo = to.replace(/[\s\-()]/g, "").replace(/^(\+?)/, "");

  try {
    const res = await fetch(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanTo,
          type: "text",
          text: { body },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error("WhatsApp Cloud API error:", res.status, errorData);
      return null;
    }

    const data = await res.json();
    const messageId = data?.messages?.[0]?.id || null;
    return messageId;
  } catch (err) {
    console.error("WhatsApp Cloud API request failed:", err);
    return null;
  }
}
