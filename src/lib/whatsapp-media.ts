// Download media from WhatsApp Cloud API

const WHATSAPP_API_URL = "https://graph.facebook.com/v21.0";

// Step 1: Get the media URL from the media ID
// Step 2: Download the actual file
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) return null;

  try {
    // Get the media URL
    const metaRes = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!metaRes.ok) {
      console.error("Failed to get media URL:", metaRes.status);
      return null;
    }

    const metaData = await metaRes.json();
    const mediaUrl = metaData.url;
    const mimeType = metaData.mime_type || "image/jpeg";

    if (!mediaUrl) return null;

    // Download the actual file
    const fileRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!fileRes.ok) {
      console.error("Failed to download media:", fileRes.status);
      return null;
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());

    // Sanity check — reject files over 10MB or under 1KB
    if (buffer.length > 10 * 1024 * 1024 || buffer.length < 1024) {
      return null;
    }

    return { buffer, mimeType };
  } catch (err) {
    console.error("WhatsApp media download error:", err);
    return null;
  }
}
