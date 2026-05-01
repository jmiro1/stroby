/**
 * Conversational profile-field updates for the WhatsApp bot.
 *
 * Replaces the old "AI hallucinates a successful update" failure mode
 * (2026-04-29 user trace: bot said "Nice. So you're all set" after the
 * user asked to change their slug — but no DB write actually happened).
 *
 * These helpers do the actual work: validate, write, return the line of
 * text the bot should send the user. Errors come back as structured
 * results so the AI tool-call layer can compose a sane reply.
 *
 * Multi-message flows (e.g. avatar upload — first ask the user to send
 * a photo, then process the next inbound image) use a `pending_intent`
 * stored under `profile.preferences.pending_intent`. Cleared after
 * fulfillment or after 10 minutes (caller checks `set_at`).
 */
import { createServiceClient } from "./supabase";
import { NICHES } from "./constants";

export type ProfileUserType = "newsletter" | "business" | "other";

function tableFor(userType: ProfileUserType): string {
  if (userType === "newsletter") return "newsletter_profiles";
  if (userType === "business") return "business_profiles";
  return "other_profiles";
}

export interface UpdateResult {
  ok: boolean;
  /** Message the bot should send the user. */
  message: string;
  /** Optional: extra detail for logs. */
  detail?: string;
}

/** Slug rules: 3-50 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen. */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/;

export async function updateSlug(
  userType: ProfileUserType,
  userId: string,
  rawSlug: string,
): Promise<UpdateResult> {
  const supabase = createServiceClient();
  const slug = rawSlug.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");

  if (!SLUG_RE.test(slug)) {
    return {
      ok: false,
      message: "That slug won't work — it needs to be 3-50 characters, lowercase letters/numbers/hyphens only, and can't start or end with a hyphen. Try something like `the-alternative-ways` or `alternativeways`.",
    };
  }

  const table = tableFor(userType);

  // Uniqueness check across all 3 profile tables — slugs are global to /creator/:slug
  for (const t of ["newsletter_profiles_all", "business_profiles_all", "other_profiles"]) {
    const { data: clash } = await supabase.from(t).select("id").eq("slug", slug).neq("id", userId).maybeSingle();
    if (clash) {
      return { ok: false, message: `That slug's taken — try another one?` };
    }
  }

  const { error } = await supabase.from(table).update({ slug }).eq("id", userId);
  if (error) {
    return { ok: false, message: "Couldn't update your slug right now — try again in a sec.", detail: error.message };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://stroby.ai";
  return {
    ok: true,
    message: `Done. Your profile is now at ${appUrl}/creator/${slug}.`,
  };
}

export async function updateDescription(
  userType: ProfileUserType,
  userId: string,
  description: string,
): Promise<UpdateResult> {
  const trimmed = description.trim();
  if (trimmed.length < 10) {
    return { ok: false, message: "That description's too short — give me at least a sentence about your audience or what you cover." };
  }
  if (trimmed.length > 2000) {
    return { ok: false, message: "Cap that at 2000 characters — try a tighter version?" };
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from(tableFor(userType)).update({ description: trimmed }).eq("id", userId);
  if (error) {
    return { ok: false, message: "Couldn't save that right now — try again?", detail: error.message };
  }
  return { ok: true, message: "Updated. Better matches incoming." };
}

export async function updateNiche(
  userType: ProfileUserType,
  userId: string,
  rawNiche: string,
): Promise<UpdateResult> {
  // Fuzzy-match user input against canonical niche list
  const norm = rawNiche.trim().toLowerCase();
  const match = NICHES.find((n) => n.toLowerCase() === norm)
    || NICHES.find((n) => n.toLowerCase().includes(norm) || norm.includes(n.toLowerCase().split(" ")[0]));
  if (!match) {
    return {
      ok: false,
      message: `I couldn't map "${rawNiche}" to one of our niches. The options are: ${NICHES.slice(0, -1).join(", ")}.`,
    };
  }

  const supabase = createServiceClient();
  const column = userType === "other" ? "niche" : "primary_niche";
  const { error } = await supabase.from(tableFor(userType)).update({ [column]: match }).eq("id", userId);
  if (error) {
    return { ok: false, message: "Couldn't save that — try again?", detail: error.message };
  }
  return { ok: true, message: `Niche set to ${match}.` };
}

/** Price input: dollars, output: cents stored in price_per_placement. Newsletter only. */
export async function updatePrice(
  userType: ProfileUserType,
  userId: string,
  rawPrice: string,
): Promise<UpdateResult> {
  if (userType !== "newsletter") {
    return { ok: false, message: "Pricing is only set on newsletter profiles right now." };
  }
  // Strip $, commas, "/placement" etc., parse number
  const cleaned = rawPrice.replace(/[$,\s]/g, "").replace(/\/.*$/, "").replace(/usd|cad/i, "");
  const dollars = parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 25 || dollars > 100000) {
    return { ok: false, message: "I need a number between $25 and $100,000 — what's your rate per placement?" };
  }
  const cents = Math.round(dollars * 100);

  const supabase = createServiceClient();
  const { error } = await supabase.from("newsletter_profiles").update({ price_per_placement: cents }).eq("id", userId);
  if (error) {
    return { ok: false, message: "Couldn't save that — try again?", detail: error.message };
  }
  return { ok: true, message: `Price set to $${dollars} per placement.` };
}

export async function updateName(
  userType: ProfileUserType,
  userId: string,
  rawName: string,
): Promise<UpdateResult> {
  const name = rawName.trim();
  if (name.length < 2 || name.length > 100) {
    return { ok: false, message: "Names should be 2-100 characters — try again?" };
  }
  const column = userType === "newsletter" ? "newsletter_name"
    : userType === "business" ? "company_name"
    : "name";
  const supabase = createServiceClient();
  const { error } = await supabase.from(tableFor(userType)).update({ [column]: name }).eq("id", userId);
  if (error) {
    return { ok: false, message: "Couldn't save that — try again?", detail: error.message };
  }
  return { ok: true, message: `Name updated to ${name}.` };
}

// ── Pending-intent state (multi-message flows) ──────────────────────

export type PendingIntent =
  | { kind: "avatar_upload"; set_at: string }
  | { kind: "verification_screenshot"; set_at: string };

const PENDING_INTENT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function setPendingIntent(
  userType: ProfileUserType,
  userId: string,
  intent: PendingIntent["kind"],
): Promise<void> {
  const supabase = createServiceClient();
  const table = tableFor(userType);
  const { data: row } = await supabase.from(table).select("preferences").eq("id", userId).maybeSingle();
  const prefs = (row?.preferences as Record<string, unknown> | null) || {};
  const updated = { ...prefs, pending_intent: { kind: intent, set_at: new Date().toISOString() } };
  await supabase.from(table).update({ preferences: updated }).eq("id", userId);
}

/** Read + clear the pending intent atomically (best-effort — not transactional). */
export async function consumePendingIntent(
  userType: ProfileUserType,
  userId: string,
): Promise<PendingIntent | null> {
  const supabase = createServiceClient();
  const table = tableFor(userType);
  const { data: row } = await supabase.from(table).select("preferences").eq("id", userId).maybeSingle();
  const prefs = (row?.preferences as Record<string, unknown> | null) || {};
  const pi = prefs.pending_intent as PendingIntent | undefined;
  if (!pi) return null;

  // TTL check
  const setAt = new Date(pi.set_at).getTime();
  if (!Number.isFinite(setAt) || Date.now() - setAt > PENDING_INTENT_TTL_MS) {
    // Stale — clear and return null
    const cleared = { ...prefs };
    delete cleared.pending_intent;
    await supabase.from(table).update({ preferences: cleared }).eq("id", userId);
    return null;
  }

  // Clear and return
  const cleared = { ...prefs };
  delete cleared.pending_intent;
  await supabase.from(table).update({ preferences: cleared }).eq("id", userId);
  return pi;
}

/** Direct avatar write — given a buffer + mime type, store it and update the profile. */
export async function writeAvatar(
  userType: ProfileUserType,
  userId: string,
  buffer: Buffer,
  contentType: string,
): Promise<UpdateResult> {
  const supabase = createServiceClient();
  const ext = contentType.split("/")[1] || "jpg";
  const crypto = await import("crypto");
  const hash = crypto.randomBytes(6).toString("hex");
  // Avatars live in the dedicated public `avatars` bucket. The original
  // path used `proof-screenshots/avatars/...` which was a private bucket
  // — `getPublicUrl()` returned a /object/public/... URL that 400'd.
  // Migration `20260501_avatars_bucket.sql` created the public bucket.
  const filename = `${userId}/${hash}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(filename, buffer, { contentType, upsert: true });

  let avatarUrl: string;
  if (uploadErr) {
    if (buffer.length < 500 * 1024) {
      avatarUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    } else {
      return { ok: false, message: "Couldn't save that photo — try a smaller image (under 5MB)?", detail: uploadErr.message };
    }
  } else {
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filename);
    avatarUrl = urlData.publicUrl;
  }

  const { error } = await supabase.from(tableFor(userType)).update({ avatar_url: avatarUrl }).eq("id", userId);
  if (error) {
    return { ok: false, message: "Saved the photo but couldn't link it to your profile — try again?", detail: error.message };
  }
  return { ok: true, message: "New profile pic set." };
}
