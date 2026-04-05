// In-memory rate limiter for webhook abuse prevention
// Resets on cold start (fine for serverless — each instance is short-lived)

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 30;

const counters = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

export function checkRateLimit(phone: string): { allowed: boolean; remaining: number } {
  const now = Date.now();

  // Inline cleanup every 5 minutes (no setInterval needed in serverless)
  if (now - lastCleanup > 5 * 60 * 1000) {
    for (const [key, entry] of counters) {
      if (now > entry.resetAt) counters.delete(key);
    }
    lastCleanup = now;
  }

  const entry = counters.get(phone);

  if (!entry || now > entry.resetAt) {
    counters.set(phone, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_PER_WINDOW - 1 };
  }

  if (entry.count >= MAX_PER_WINDOW) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: MAX_PER_WINDOW - entry.count };
}
