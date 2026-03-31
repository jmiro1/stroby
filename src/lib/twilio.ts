// Lazy-loaded Twilio client for sending WhatsApp messages
export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("Twilio not configured, skipping WhatsApp message");
    return null;
  }

  const twilio = require("twilio");
  const client = twilio(accountSid, authToken);

  const message = await client.messages.create({
    body,
    from: `whatsapp:${fromNumber}`,
    to: `whatsapp:${to}`,
  });

  return message.sid;
}
