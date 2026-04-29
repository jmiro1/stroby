// Pre-AI intent classification — handles simple messages without burning tokens.
//
// IMPORTANT — historical bug (2026-04-29): the previous version used
// `normalized.includes(phrase)` for STATUS / STOP / VERIFY / STRIPE matching.
// That over-matched any message containing the substring. Example:
// "my profile pic" → contains "my profile" → classified as `status_check` →
// routed to a profile dump → AI never saw the message → bot looped on the
// same canned reply across 6 user turns. The classifier now uses exact
// match against a normalized form (trailing punctuation stripped); short-
// length cap kept as a sanity check.

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
// Stripe-specific phrasings. Removed bare "stripe" / generic "payment link" /
// "get paid" / "receive payment" — too easy to fire on natural conversation.
// Keep only phrases that unambiguously mean "send me the Stripe setup link".
const STRIPE_EXACT = new Set([
  "stripe link", "send me stripe", "send me the stripe link", "send stripe link",
  "connect stripe", "setup stripe", "stripe setup",
  "setup stroby pay", "stroby pay setup",
  "payment setup", "setup payment",
  "how do i get paid",
]);
const GREETING = new Set(["hey", "hi", "hello", "yo", "sup", "hola", "what's up", "whats up"]);
const STOP_EXACT = new Set([
  "stop", "stop messages", "stop messaging me",
  "unsubscribe",
  "opt out", "opt-out",
  "remove me",
  "delete my account", "delete account",
]);
// Status/profile-summary phrasings. Drop bare "profile" entirely (too greedy)
// and "my profile" alone too — it's a fragment that appears in MANY natural
// asks like "my profile pic". Only match well-formed status questions.
const STATUS_EXACT = new Set([
  "status", "my status",
  "show my profile", "show profile", "see my profile",
  "what's my status", "whats my status",
  "what's my profile", "whats my profile",
  "how am i doing",
  "check my profile", "check status",
  "my current status", "what's my current status", "whats my current status",
]);
// Verification: drop the bare word "verify" (matches too many sentences) and
// "verification" alone. Keep specific request phrasings.
const VERIFY_EXACT = new Set([
  "verify me", "get verified",
  "send verification", "send verify link", "send me verification",
  "verify my account", "verify my profile",
  "i want to verify", "i want to get verified",
  "verification link",
]);

/** Strip trailing punctuation/whitespace and normalize. */
function normalize(message: string): string {
  return message.toLowerCase().trim().replace(/[?!.,;\s]+$/, "");
}

export function classifyIntent(message: string, lastBotMessage?: string): ClassifiedIntent {
  const normalized = normalize(message);
  const lastBot = (lastBotMessage || "").toLowerCase();

  // Empty
  if (!normalized) return { type: "needs_ai" };

  // Context-aware: if the bot just asked about verification and user says
  // "yes"/"sure"/etc., treat it as verify_request, not accept. Fixes the loop
  // where "yes" to "Want me to send you a verification link?" was classified
  // as "accept" (match intro acceptance).
  if (lastBot.includes("verification") || lastBot.includes("verify") || lastBot.includes("verified")) {
    const affirmatives = ["yes", "yeah", "yep", "yup", "sure", "ok", "okay", "absolutely", "go ahead", "please", "send it", "do it"];
    if (affirmatives.includes(normalized)) return { type: "verify_request" };
  }

  // Rating: standalone digit 1-5 (with optional /5 or "out of 5" suffix)
  const ratingMatch = normalized.match(/^(\d)(?:\s*(?:\/5|out of 5|stars?))?$/);
  if (ratingMatch) {
    const value = parseInt(ratingMatch[1], 10);
    if (value >= 1 && value <= 5) return { type: "rating", value };
  }

  // ── Exact-match buckets (no .includes() — that's how we got into the
  //    profile-dump loop). Length cap as belt-and-braces.
  if (normalized.length <= 50) {
    if (STOP_EXACT.has(normalized)) return { type: "stop" };
    if (STATUS_EXACT.has(normalized)) return { type: "status_check" };
    if (VERIFY_EXACT.has(normalized)) return { type: "verify_request" };
    if (STRIPE_EXACT.has(normalized)) return { type: "stripe_request" };
  }

  // Tell me more — short messages only
  if (normalized.length <= 40) {
    for (const phrase of MORE) {
      if (normalized === phrase) return { type: "tell_me_more" };
    }
  }

  // Accept (short messages only, exact match)
  if (normalized.length < 30) {
    for (const phrase of ACCEPT) {
      if (normalized === phrase) return { type: "accept" };
    }
  }

  // Decline (short messages only, exact match)
  if (normalized.length < 30) {
    for (const phrase of DECLINE) {
      if (normalized === phrase) return { type: "decline" };
    }
  }

  // Greeting (standalone only)
  if (normalized.length < 20 && GREETING.has(normalized)) {
    return { type: "greeting" };
  }

  return { type: "needs_ai" };
}

export const CANNED_RESPONSES: Record<string, string> = {
  greeting: "Hey! How can I help you today? Looking for matches, want to update your profile, or have a question?",
  stop: "I've noted your request. If you'd like to delete your account, reply *delete my account* and I'll process it. Otherwise, I'll stop messaging you.",
};
