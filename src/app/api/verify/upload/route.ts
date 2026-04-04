import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_FILE_SIZE = 5 * 1024;
const TOLERANCE = 0.15; // 15% tolerance for metric comparison

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

interface ExtractedMetrics {
  subscriber_count?: number;
  open_rate?: number;
  ctr?: number;
  platform?: string;
  date_visible?: string;
  confidence: "high" | "medium" | "low";
  is_relevant: boolean;
  raw_text?: string;
}

// Use Claude vision to extract metrics from a screenshot
async function extractMetricsFromImage(
  base64: string,
  mediaType: string
): Promise<ExtractedMetrics> {
  const anthropic = getAnthropic();

  const completion = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
            data: base64,
          },
        },
        {
          type: "text",
          text: `Extract newsletter/audience metrics from this screenshot. Look for:
- Subscriber count (or follower count, audience size)
- Open rate (percentage)
- Click-through rate / CTR (percentage)
- Which platform this is from (Beehiiv, ConvertKit, Substack, Mailchimp, etc.)
- Any visible date

First: is this actually a screenshot of a newsletter/content analytics dashboard? If it's a random photo, meme, selfie, or unrelated document, set is_relevant to false.

Respond ONLY with valid JSON:
{"is_relevant": true, "subscriber_count": 15000, "open_rate": 42.5, "ctr": 3.2, "platform": "Beehiiv", "date_visible": "March 2026", "confidence": "high"}

Use null for any metric you can't find. Set confidence to "high" if numbers are clearly readable, "medium" if partially visible, "low" if you're guessing. Set is_relevant to false if this isn't an analytics screenshot.`,
        },
      ],
    }],
  });

  const text = completion.content[0].type === "text" ? completion.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { confidence: "low", is_relevant: false, raw_text: text };
  }

  try {
    return JSON.parse(jsonMatch[0]) as ExtractedMetrics;
  } catch {
    return { confidence: "low", is_relevant: false, raw_text: text };
  }
}

// Compare extracted metrics against profile and determine verification result
function compareMetrics(
  extracted: ExtractedMetrics,
  profile: Record<string, unknown>
): { verified: boolean; discrepancies: string[]; updates: Record<string, unknown> } {
  const discrepancies: string[] = [];
  const updates: Record<string, unknown> = {};

  const reportedSubs = profile.subscriber_count as number | null;
  const reportedOpen = profile.avg_open_rate as number | null;
  const reportedCtr = profile.avg_ctr as number | null;

  // Check subscriber count
  if (extracted.subscriber_count && reportedSubs) {
    const diff = Math.abs(extracted.subscriber_count - reportedSubs) / reportedSubs;
    if (diff > TOLERANCE) {
      discrepancies.push(
        `Subscribers: reported ${reportedSubs.toLocaleString()}, screenshot shows ${extracted.subscriber_count.toLocaleString()}`
      );
    }
    // Always update to the screenshot value (source of truth)
    updates.subscriber_count = extracted.subscriber_count;
  } else if (extracted.subscriber_count && !reportedSubs) {
    updates.subscriber_count = extracted.subscriber_count;
  }

  // Check open rate
  if (extracted.open_rate != null && reportedOpen != null) {
    const reportedPct = reportedOpen > 1 ? reportedOpen : reportedOpen * 100;
    const diff = Math.abs(extracted.open_rate - reportedPct) / reportedPct;
    if (diff > TOLERANCE) {
      discrepancies.push(
        `Open rate: reported ${reportedPct.toFixed(1)}%, screenshot shows ${extracted.open_rate.toFixed(1)}%`
      );
    }
    updates.avg_open_rate = extracted.open_rate / 100; // Store as decimal
  } else if (extracted.open_rate != null && reportedOpen == null) {
    updates.avg_open_rate = extracted.open_rate / 100;
  }

  // Check CTR
  if (extracted.ctr != null && reportedCtr != null) {
    const reportedPct = reportedCtr > 1 ? reportedCtr : reportedCtr * 100;
    const diff = Math.abs(extracted.ctr - reportedPct) / Math.max(reportedPct, 0.1);
    if (diff > TOLERANCE) {
      discrepancies.push(
        `CTR: reported ${reportedPct.toFixed(1)}%, screenshot shows ${extracted.ctr.toFixed(1)}%`
      );
    }
    updates.avg_ctr = extracted.ctr / 100;
  } else if (extracted.ctr != null && reportedCtr == null) {
    updates.avg_ctr = extracted.ctr / 100;
  }

  // Verified if confidence is high/medium and no major discrepancies
  const verified = extracted.confidence !== "low" && discrepancies.length === 0;

  return { verified, discrepancies, updates };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const newsletterId = formData.get("newsletterId") as string | null;

    if (!file || !newsletterId) {
      return Response.json({ error: "Missing file or newsletterId" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return Response.json({
        error: `File type not accepted. Please upload a PNG, JPEG, WebP, GIF, or PDF.`,
      }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({
        error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum is 10MB.`,
      }, { status: 400 });
    }

    if (file.size < MIN_FILE_SIZE) {
      return Response.json({
        error: "File too small — this doesn't look like a screenshot.",
      }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: profile, error: fetchError } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", newsletterId)
      .single();

    if (fetchError || !profile) {
      return Response.json({ error: "Newsletter profile not found" }, { status: 404 });
    }

    // Check upload limit (max 3 per account)
    const existingData = profile.verification_data as Record<string, unknown> | null;
    const uploadCount = (existingData?.upload_count as number) || 0;
    if (uploadCount >= 3) {
      return Response.json({
        error: "You've reached the maximum of 3 verification uploads. Contact us on WhatsApp if you need help.",
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const hash = crypto.randomBytes(8).toString("hex");

    // Store the file reference
    const ext = file.name.split(".").pop() || "png";
    const filename = `verify/${newsletterId}/${hash}.${ext}`;

    // Try uploading to storage (non-blocking if it fails)
    let screenshotUrl: string | null = null;
    const { error: uploadError } = await supabase.storage
      .from("proof-screenshots")
      .upload(filename, buffer, { contentType: file.type, upsert: false });

    if (!uploadError) {
      const { data: urlData } = supabase.storage
        .from("proof-screenshots")
        .getPublicUrl(filename);
      screenshotUrl = urlData.publicUrl;
    }

    // PDF can't be analyzed by vision — flag for human review
    if (file.type === "application/pdf") {
      await supabase
        .from("newsletter_profiles")
        .update({
          verification_status: "screenshot",
          verification_data: {
            screenshot_url: screenshotUrl,
            file_name: file.name,
            file_size: file.size,
            upload_reference: hash,
            status: "pending_human_review",
            reason: "PDF uploaded — requires manual verification",
            uploaded_at: new Date().toISOString(),
          },
        })
        .eq("id", newsletterId);

      await supabase.from("flagged_messages").insert({
        user_id: newsletterId,
        user_type: "newsletter",
        phone: profile.phone || "",
        content: `PDF verification upload for ${profile.newsletter_name}. File: ${file.name}. Needs manual review.`,
        flag_reason: "pdf_verification",
      });

      if (profile.phone) {
        await sendWhatsAppMessage(
          profile.phone,
          `Upload received for *${profile.newsletter_name}*! Since it's a PDF, our team will review it manually. You'll hear back within 24 hours.`
        );
      }

      return Response.json({
        success: true,
        status: "pending_review",
        message: "PDF uploaded — our team will review it within 24 hours.",
      });
    }

    // Image — run AI verification
    let extracted: ExtractedMetrics;
    try {
      extracted = await extractMetricsFromImage(base64, file.type);
    } catch (err) {
      console.error("AI metric extraction failed:", err);
      // Fall back to pending review
      await supabase
        .from("newsletter_profiles")
        .update({
          verification_status: "screenshot",
          verification_data: {
            screenshot_url: screenshotUrl,
            file_name: file.name,
            status: "pending_human_review",
            reason: "AI extraction failed",
            uploaded_at: new Date().toISOString(),
          },
        })
        .eq("id", newsletterId);

      return Response.json({
        success: true,
        status: "pending_review",
        message: "Upload received! We'll verify your metrics shortly.",
      });
    }

    // Increment upload count
    await supabase
      .from("newsletter_profiles")
      .update({
        verification_data: {
          ...(existingData || {}),
          upload_count: uploadCount + 1,
        },
      })
      .eq("id", newsletterId);

    // Check if the file is relevant
    if (!extracted.is_relevant) {
      if (profile.phone) {
        await sendWhatsAppMessage(
          profile.phone,
          `The file you uploaded for *${profile.newsletter_name}* doesn't look like an analytics screenshot. Please upload a screenshot of your newsletter/content dashboard showing subscriber count and engagement metrics. You have ${2 - uploadCount} upload${2 - uploadCount === 1 ? "" : "s"} remaining.`
        );
      }

      return Response.json({
        success: false,
        error: "This doesn't look like an analytics screenshot. Please upload a screenshot of your newsletter dashboard showing subscriber count, open rate, etc.",
      });
    }

    if (extracted.confidence === "low") {
      // Can't read the image — flag for human review
      await supabase
        .from("newsletter_profiles")
        .update({
          verification_status: "screenshot",
          verification_data: {
            screenshot_url: screenshotUrl,
            file_name: file.name,
            extracted,
            status: "pending_human_review",
            reason: "Low confidence — couldn't clearly read metrics",
            uploaded_at: new Date().toISOString(),
          },
        })
        .eq("id", newsletterId);

      await supabase.from("flagged_messages").insert({
        user_id: newsletterId,
        user_type: "newsletter",
        phone: profile.phone || "",
        content: `Low confidence verification for ${profile.newsletter_name}. AI couldn't read metrics clearly.`,
        flag_reason: "low_confidence_verification",
      });

      if (profile.phone) {
        await sendWhatsAppMessage(
          profile.phone,
          `Upload received for *${profile.newsletter_name}*! I had trouble reading the numbers clearly — our team will take a look within 24 hours. For faster verification, try a clearer screenshot of your analytics dashboard.`
        );
      }

      return Response.json({
        success: true,
        status: "pending_review",
        message: "Upload received but the image was hard to read. Try a clearer screenshot, or we'll review manually within 24 hours.",
        extracted,
      });
    }

    // Compare extracted metrics against profile
    const comparison = compareMetrics(extracted, profile);

    if (comparison.verified) {
      // Auto-verified — update profile with extracted metrics
      await supabase
        .from("newsletter_profiles")
        .update({
          ...comparison.updates,
          verification_status: "screenshot",
          verification_data: {
            screenshot_url: screenshotUrl,
            file_name: file.name,
            extracted,
            status: "auto_verified",
            verified_at: new Date().toISOString(),
          },
        })
        .eq("id", newsletterId);

      if (profile.phone) {
        const metricsMsg = [
          extracted.subscriber_count ? `${extracted.subscriber_count.toLocaleString()} subscribers` : null,
          extracted.open_rate ? `${extracted.open_rate.toFixed(1)}% open rate` : null,
          extracted.ctr ? `${extracted.ctr.toFixed(1)}% CTR` : null,
        ].filter(Boolean).join(", ");

        await sendWhatsAppMessage(
          profile.phone,
          `*${profile.newsletter_name}* is now verified! ✅\n\nConfirmed: ${metricsMsg}${extracted.platform ? ` (via ${extracted.platform})` : ""}\n\nVerified creators get prioritized in matching!`
        );
      }

      return Response.json({
        success: true,
        status: "verified",
        message: "Verification successful!",
        metrics: {
          subscribers: extracted.subscriber_count,
          openRate: extracted.open_rate,
          ctr: extracted.ctr,
          platform: extracted.platform,
        },
      });
    } else {
      // Discrepancies found — flag for review but still save
      await supabase
        .from("newsletter_profiles")
        .update({
          verification_status: "screenshot",
          verification_data: {
            screenshot_url: screenshotUrl,
            file_name: file.name,
            extracted,
            discrepancies: comparison.discrepancies,
            status: "discrepancy_review",
            uploaded_at: new Date().toISOString(),
          },
        })
        .eq("id", newsletterId);

      await supabase.from("flagged_messages").insert({
        user_id: newsletterId,
        user_type: "newsletter",
        phone: profile.phone || "",
        content: `Verification discrepancy for ${profile.newsletter_name}: ${comparison.discrepancies.join("; ")}`,
        flag_reason: "verification_discrepancy",
      });

      if (profile.phone) {
        await sendWhatsAppMessage(
          profile.phone,
          `Upload received for *${profile.newsletter_name}*! We noticed some differences between your reported metrics and the screenshot. Our team will review and update your profile within 24 hours.`
        );
      }

      return Response.json({
        success: true,
        status: "review",
        message: "Upload received! We noticed some differences and will review manually.",
        discrepancies: comparison.discrepancies,
        extracted: {
          subscribers: extracted.subscriber_count,
          openRate: extracted.open_rate,
          ctr: extracted.ctr,
        },
      });
    }
  } catch (err) {
    console.error("Upload verify error:", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
