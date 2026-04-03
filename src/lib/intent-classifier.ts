// Pre-AI intent classification — handles simple messages without burning tokens

export type ClassifiedIntent =
  | { type: "accept" }
  | { type: "decline" }
  | { type: "tell_me_more" }
  | { type: "rating"; value: number }
  | { type: "stripe_request" }
  | { type: "greeting" }
  | { type: "stop" }
  | { type: "needs_ai" };

const ACCEPT = ["yes", "accept", "sounds good", "let's do it", "lets do it", "interested", "sure", "go ahead", "absolutely", "yeah", "yep", "yup", "ok", "okay", "connect us", "introduce us", "i'm in", "im in", "do it"];
const DECLINE = ["no", "decline", "not right now", "pass", "skip", "not interested", "no thanks", "no thank you", "nah", "nope", "maybe later", "not now"];
const MORE = ["tell me more", "more info", "more details", "details", "what else", "can you tell me more", "elaborate"];
const STRIPE = ["stripe", "payment", "pay", "get paid", "setup payment", "connect stripe", "payment link", "payment setup", "send me stripe", "stripe link"];
const GREETING = ["hey", "hi", "hello", "yo", "sup", "hola", "what's up", "whats up"];
const STOP = ["stop", "unsubscribe", "opt out", "remove me", "delete my account"];

export function classifyIntent(message: string): ClassifiedIntent {
  const normalized = message.toLowerCase().trim();

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

  // Tell me more (check before accept — "tell me more" contains "me" which could false match)
  for (const phrase of MORE) {
    if (normalized === phrase || normalized.includes(phrase)) return { type: "tell_me_more" };
  }

  // Stripe request
  for (const phrase of STRIPE) {
    if (normalized === phrase || normalized.includes(phrase)) return { type: "stripe_request" };
  }

  // Accept (only for short messages to avoid false positives on "yes I have a question about...")
  if (normalized.length < 30) {
    for (const phrase of ACCEPT) {
      if (normalized === phrase) return { type: "accept" };
    }
  }

  // Decline (same — short messages only)
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

// Pre-built responses for classified intents (no AI needed)
export const CANNED_RESPONSES: Record<string, string> = {
  greeting: "Hey! How can I help you today? Looking for matches, want to update your profile, or have a question?",
  stop: "I've noted your request. If you'd like to delete your account, reply *delete my account* and I'll process it. Otherwise, I'll stop messaging you.",
  accept_no_match: "I appreciate the enthusiasm! But I don't have a pending match for you to accept right now. I'll message you when I find one!",
  decline_no_match: "No worries! There's nothing pending right now anyway. I'll only send you matches that are a really good fit.",
  more_no_match: "There's no pending match to tell you more about right now. But I'm actively looking! Anything you'd like to update about your profile?",
};
