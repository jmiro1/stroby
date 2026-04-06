// Check WhatsApp access token expiry via Meta's debug_token endpoint
// Cached for 1 hour to avoid rate limits

let cachedCheck: { expiresAt: number | null; daysRemaining: number | null; checkedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function checkWhatsAppTokenExpiry(): Promise<{
  expiresAt: number | null;
  daysRemaining: number | null;
  error?: string;
}> {
  const now = Date.now();
  if (cachedCheck && now - cachedCheck.checkedAt < CACHE_TTL) {
    return { expiresAt: cachedCheck.expiresAt, daysRemaining: cachedCheck.daysRemaining };
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const appId = process.env.META_APP_ID || "1278038874427869";
  const appSecret = process.env.META_APP_SECRET;

  if (!accessToken || !appSecret) {
    return { expiresAt: null, daysRemaining: null, error: "Missing token or app secret" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
    );
    if (!res.ok) {
      return { expiresAt: null, daysRemaining: null, error: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const expiresAt = data?.data?.expires_at; // Unix timestamp (seconds), 0 = never expires

    if (!expiresAt || expiresAt === 0) {
      // Permanent token
      cachedCheck = { expiresAt: null, daysRemaining: null, checkedAt: now };
      return { expiresAt: null, daysRemaining: null };
    }

    const daysRemaining = Math.max(0, Math.floor((expiresAt * 1000 - now) / (24 * 60 * 60 * 1000)));
    cachedCheck = { expiresAt, daysRemaining, checkedAt: now };
    return { expiresAt, daysRemaining };
  } catch (err) {
    return { expiresAt: null, daysRemaining: null, error: String(err) };
  }
}
