// WhatsApp Cloud API (Meta)
// Exports: sendWhatsAppMessage (text), sendWhatsAppTemplate (template), sendWhatsAppSmart (auto-fallback)

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

// ── Template registry ──
export type TemplateId =
  | "match_found"
  | "match_confirmation"
  | "follow_up"
  | "placement_reminder"
  | "weekly_update"
  | "call_permission"
  | "welcome";

const TEMPLATE_MAP: Record<TemplateId, { name: string; language: string }> = {
  match_found:        { name: "match_found_1",        language: "en" },
  match_confirmation: { name: "match_confirmation",    language: "en" },
  follow_up:          { name: "follow_up_feedback",    language: "en" },
  placement_reminder: { name: "placement_reminder",    language: "en" },
  weekly_update:      { name: "weekly_update",         language: "en" },
  call_permission:    { name: "call_permission_1",     language: "en_US" },
  welcome:            { name: "welcome_confirmation",  language: "en_US" },
};

function cleanPhone(to: string): string {
  return to.replace(/[\s\-()]/g, "").replace(/^(\+?)/, "");
}

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

// ── Send a free-form text message (works within 24h reply window) ──
export async function sendWhatsAppMessage(
  to: string,
  body: string
): Promise<string | null> {
  const config = getConfig();
  if (!config) {
    console.warn("WhatsApp Cloud API not configured, skipping message");
    return null;
  }

  try {
    const res = await fetch(
      `${WHATSAPP_API_URL}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone(to),
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
    return data?.messages?.[0]?.id || null;
  } catch (err) {
    console.error("WhatsApp Cloud API request failed:", err);
    return null;
  }
}

// ── Send a template message (works outside 24h window) ──
export async function sendWhatsAppTemplate(
  to: string,
  templateId: TemplateId,
  params: string[]
): Promise<string | null> {
  const config = getConfig();
  if (!config) {
    console.warn("WhatsApp Cloud API not configured, skipping template");
    return null;
  }

  const template = TEMPLATE_MAP[templateId];
  if (!template) {
    console.error("Unknown template ID:", templateId);
    return null;
  }

  const components: Record<string, unknown>[] = [];
  if (params.length > 0) {
    components.push({
      type: "body",
      parameters: params.map((value) => ({ type: "text", text: value })),
    });
  }

  try {
    const res = await fetch(
      `${WHATSAPP_API_URL}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone(to),
          type: "template",
          template: {
            name: template.name,
            language: { code: template.language },
            components,
          },
        }),
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.error("WhatsApp template error:", res.status, errorData);
      return null;
    }

    const data = await res.json();
    return data?.messages?.[0]?.id || null;
  } catch (err) {
    console.error("WhatsApp template request failed:", err);
    return null;
  }
}

// ── Smart send: tries text first, falls back to template ──
// Use for proactive messages where user may or may not be in the 24h window
export async function sendWhatsAppSmart(
  to: string,
  body: string,
  templateId: TemplateId,
  templateParams: string[]
): Promise<string | null> {
  const textResult = await sendWhatsAppMessage(to, body);
  if (textResult) return textResult;

  // Text failed (likely outside 24h window) — fall back to template
  return sendWhatsAppTemplate(to, templateId, templateParams);
}
