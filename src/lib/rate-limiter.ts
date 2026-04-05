// Simple in-memory rate limiter for webhook abuse prevention
// Resets on each cold start (which is fine for Vercel serverless)

const windowMs = 60 * 60 * 1000; // 1 hour
const maxPerWindow = 30; // 30 messages per phone per hour

const counters = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(phone: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = counters.get(phone);

  if (!entry || now > entry.resetAt) {
    counters.set(phone, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxPerWindow - 1 };
  }

  if (entry.count >= maxPerWindow) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: maxPerWindow - entry.count };
}

// Cleanup old entries periodically (prevent memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of counters) {
    if (now > entry.resetAt) counters.delete(key);
  }
}, 5 * 60 * 1000); // Every 5 minutes
