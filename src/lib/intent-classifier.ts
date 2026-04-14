// Pre-AI intent classification — handles simple messages without burning tokens

export type ClassifiedIntent =
  | { type: "accept" }
  | { type: "decline" }
  | { type: "tell_me_more" }
  | { type: "rating"; value: number }
  | { type: "stripe_request" }
  | { type: "greeting" }
  | { type: "stop" }
  | { type: "status_check" }
  | { type: "verify_request" }
  | { type: "needs_ai" };

const ACCEPT = ["yes", "accept", "sounds good", "let's do it", "lets do it", "interested", "sure", "go ahead", "absolutely", "yeah", "yep", "yup", "ok", "okay", "connect us", "introduce us", "i'm in", "im in", "do it"];
const DECLINE = ["no", "decline", "not right now", "pass", "skip", "not interested", "no thanks", "no thank you", "nah", "nope", "maybe later", "not now"];
const MORE = ["tell me more", "more info", "more details", "details", "what else", "can you tell me more", "elaborate"];
const STRIPE = ["stripe", "connect stripe", "stripe link", "send me stripe", "setup stripe", "stripe setup", "payment setup", "setup payment", "payment link", "get paid", "how do i get paid", "receive payment", "connect payment"];
const GREETING = ["hey", "hi", "hello", "yo", "sup", "hola", "what's up", "whats up"];
const STOP = ["stop", "unsubscribe", "opt out", "remove me", "delete my account"];
const STATUS = ["status", "my profile", "my status", "profile", "show my profile", "what's my status", "whats my status", "how am i doing", "check my profile"];
const VERIFY = ["verify", "verification", "verify me", "get verified", "send verification", "verify my account"];

export function classifyIntent(message: string, lastBotMessage?: string): ClassifiedIntent {
  const normalized = message.toLowerCase().trim();
  const lastBot = (lastBotMessage || "").toLowerCase();

  // Context-aware: if the bot just asked about verification and user says "yes"/"sure"/etc.,
  // treat it as verify_request, not accept. Fixes the loop where "yes" to "Want me to send
  // you a verification link?" was classified as "accept" (match intro acceptance).
  if (lastBot.includes("verification") || lastBot.includes("verify") || lastBot.includes("verified")) {
    const affirmatives = ["yes", "yeah", "yep", "yup", "sure", "ok", "okay", "absolutely", "go ahead", "please", "send it", "do it"];
    for (const phrase of affirmatives) {
      if (normalized === phrase || normalized === phrase + "!") return { type: "verify_request" };
    }
  }

  // Rating: standalone digit 1-5
  const ratingMatch = normalized.match(/^(\d)(?:\s*(?:\/5|out of 5|stars?))?$/);
  if (ratingMatch) {
    const value = parseInt(ratingMatch[1], 10);
    if (value >= 1 && value <= 5) return { type: "rating", value };
  }

  // Stop / unsubscribe
  for (const phrase of STOP) {
    if (normalized === phrase || normalized.startsWith(phrase)) return { type: "stop" };
  }

  // Status check
  for (const phrase of STATUS) {
    if (normalized === phrase || normalized.includes(phrase)) return { type: "status_check" };
  }

  // Verify request
  for (const phrase of VERIFY) {
    if (normalized === phrase || normalized.includes(phrase)) return { type: "verify_request" };
  }

  // Tell me more
  for (const phrase of MORE) {
    if (normalized === phrase || normalized.includes(phrase)) return { type: "tell_me_more" };
  }

  // Stripe request
  for (const phrase of STRIPE) {
    if (normalized === phrase || normalized.includes(phrase)) return { type: "stripe_request" };
  }

  // Accept (short messages only)
  if (normalized.length < 30) {
    for (const phrase of ACCEPT) {
      if (normalized === phrase) return { type: "accept" };
    }
  }

  // Decline (short messages only)
  if (normalized.length < 30) {
    for (const phrase of DECLINE) {
      if (normalized === phrase) return { type: "decline" };
    }
  }

  // Greeting (standalone only)
  if (normalized.length < 20) {
    for (const phrase of GREETING) {
      if (normalized === phrase || normalized === phrase + "!") return { type: "greeting" };
    }
  }

  return { type: "needs_ai" };
}

export const CANNED_RESPONSES: Record<string, string> = {
  greeting: "Hey! How can I help you today? Looking for matches, want to update your profile, or have a question?",
  stop: "I've noted your request. If you'd like to delete your account, reply *delete my account* and I'll process it. Otherwise, I'll stop messaging you.",
};
