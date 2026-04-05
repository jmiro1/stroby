import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "application/pdf"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_FILE_SIZE = 5 * 1024;
const TOLERANCE = 0.15;

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
}

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
          text: `First: is this a screenshot of a newsletter/content analytics dashboard? If it's a logo, photo, meme, selfie, or anything that is NOT an analytics/metrics dashboard, set is_relevant to false immediately.

If it IS an analytics screenshot, extract:
- Subscriber count (or follower count)
- Open rate (percentage)
- CTR (percentage)
- Platform (Beehiiv, ConvertKit, Substack, Mailchimp, etc.)
- Any visible date

Respond ONLY with JSON:
{"is_relevant": true, "subscriber_count": 15000, "open_rate": 42.5, "ctr": 3.2, "platform": "Beehiiv", "date_visible": "March 2026", "confidence": "high"}

Use null for metrics you can't find. Confidence: "high" if clear, "medium" if partial, "low" if guessing.`,
        },
      ],
    }],
  });

  const text = completion.content[0].type === "text" ? completion.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { confidence: "low", is_relevant: false };

  try {
    return JSON.parse(jsonMatch[0]) as ExtractedMetrics;
  } catch {
    return { confidence: "low", is_relevant: false };
  }
}

function compareMetrics(
  extracted: ExtractedMetrics,
  profile: Record<string, unknown>
): { verified: boolean; discrepancies: string[]; updates: Record<string, unknown> } {
  const discrepancies: string[] = [];
  const updates: Record<string, unknown> = {};

  const reportedSubs = profile.subscriber_count as number | null;
  const reportedOpen = profile.avg_open_rate as number | null;
  const reportedCtr = profile.avg_ctr as number | null;

  if (extracted.subscriber_count && reportedSubs) {
    const diff = Math.abs(extracted.subscriber_count - reportedSubs) / reportedSubs;
    if (diff > TOLERANCE) {
      discrepancies.push(`Subscribers: reported ${reportedSubs.toLocaleString()}, screenshot shows ${extracted.subscriber_count.toLocaleString()}`);
    }
    updates.subscriber_count = extracted.subscriber_count;
  } else if (extracted.subscriber_count) {
    updates.subscriber_count = extracted.subscriber_count;
  }

  if (extracted.open_rate != null && reportedOpen != null) {
    const reportedPct = reportedOpen > 1 ? reportedOpen : reportedOpen * 100;
    const diff = Math.abs(extracted.open_rate - reportedPct) / Math.max(reportedPct, 0.1);
    if (diff > TOLERANCE) {
      discrepancies.push(`Open rate: reported ${reportedPct.toFixed(1)}%, screenshot shows ${extracted.open_rate.toFixed(1)}%`);
    }
    updates.avg_open_rate = extracted.open_rate / 100;
  } else if (extracted.open_rate != null) {
    updates.avg_open_rate = extracted.open_rate / 100;
  }

  if (extracted.ctr != null && reportedCtr != null) {
    const reportedPct = reportedCtr > 1 ? reportedCtr : reportedCtr * 100;
    const diff = Math.abs(extracted.ctr - reportedPct) / Math.max(reportedPct, 0.1);
    if (diff > TOLERANCE) {
      discrepancies.push(`CTR: reported ${reportedPct.toFixed(1)}%, screenshot shows ${extracted.ctr.toFixed(1)}%`);
    }
    updates.avg_ctr = extracted.ctr / 100;
  } else if (extracted.ctr != null) {
    updates.avg_ctr = extracted.ctr / 100;
  }

  return {
    verified: extracted.confidence !== "low" && discrepancies.length === 0,
    discrepancies,
    updates,
  };
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
      return Response.json({ error: "Please upload a PNG, JPEG, WebP, GIF, or PDF." }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.` }, { status: 400 });
    }
    if (file.size < MIN_FILE_SIZE) {
      return Response.json({ error: "File too small — doesn't look like a screenshot." }, { status: 400 });
    }

    const supabase = createServiceClient();

    const { data: profile } = await supabase
      .from("newsletter_profiles")
      .select("*")
      .eq("id", newsletterId)
      .single();

    if (!profile) {
      return Response.json({ error: "Newsletter profile not found" }, { status: 404 });
    }

    // Check upload limit
    const existingData = profile.verification_data as Record<string, unknown> | null;
    const uploadCount = (existingData?.upload_count as number) || 0;
    if (uploadCount >= 3) {
      return Response.json({
        error: "Maximum 3 uploads reached. Message Stroby on WhatsApp if you need help.",
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const hash = crypto.randomBytes(8).toString("hex");
    const ext = file.name.split(".").pop() || "png";
    const filename = `verify/${newsletterId}/${hash}.${ext}`;

    // Upload to storage
    let screenshotUrl: string | null = null;
    const { error: uploadError } = await supabase.storage
      .from("proof-screenshots")
      .upload(filename, buffer, { contentType: file.type, upsert: false });
    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("proof-screenshots").getPublicUrl(filename);
      screenshotUrl = urlData.publicUrl;
    }

    // Increment upload count
    const newUploadCount = uploadCount + 1;

    // Send neutral WhatsApp confirmation immediately
    if (profile.phone) {
      await sendWhatsAppMessage(
        profile.phone,
        `We've received your submitted material for *${profile.newsletter_name}*. You'll get a confirmation or a request for more info soon.`
      );
    }

    // PDF — can't vision-analyze, flag for human review
    if (file.type === "application/pdf") {
      await supabase.from("newsletter_profiles").update({
        verification_data: {
          screenshot_url: screenshotUrl,
          file_name: file.name,
          upload_count: newUploadCount,
          status: "pending_human_review",
          reason: "PDF requires manual review",
          uploaded_at: new Date().toISOString(),
        },
      }).eq("id", newsletterId);

      await supabase.from("flagged_messages").insert({
        user_id: newsletterId, user_type: "newsletter",
        phone: profile.phone || "",
        content: `PDF verification upload for ${profile.newsletter_name}. File: ${file.name}`,
        flag_reason: "pdf_verification",
      });

      return Response.json({ success: true, status: "pending_review", message: "PDF received — we'll review it within 24 hours." });
    }

    // Image — AI analysis
    let extracted: ExtractedMetrics;
    try {
      extracted = await extractMetricsFromImage(base64, file.type);
    } catch (err) {
      console.error("AI extraction failed:", err);
      await supabase.from("newsletter_profiles").update({
        verification_data: {
          screenshot_url: screenshotUrl, file_name: file.name,
          upload_count: newUploadCount, status: "pending_human_review",
          reason: "AI extraction failed", uploaded_at: new Date().toISOString(),
        },
      }).eq("id", newsletterId);

      return Response.json({ success: true, status: "pending_review", message: "Upload received — we'll review shortly." });
    }

    // Not relevant — reject
    if (!extracted.is_relevant) {
      await supabase.from("newsletter_profiles").update({
        verification_data: { ...(existingData || {}), upload_count: newUploadCount },
      }).eq("id", newsletterId);

      const remaining = 3 - newUploadCount;
      if (profile.phone) {
        await sendWhatsAppMessage(
          profile.phone,
          `The file you uploaded doesn't look like an analytics screenshot. Please upload a screenshot of your newsletter dashboard showing subscriber count and engagement metrics.${remaining > 0 ? ` You have ${remaining} upload${remaining === 1 ? "" : "s"} remaining.` : ""}`
        );
      }

      return Response.json({
        success: false,
        error: "This doesn't look like an analytics screenshot. Please upload your newsletter dashboard.",
      });
    }

    // Low confidence — flag for review
    if (extracted.confidence === "low") {
      await supabase.from("newsletter_profiles").update({
        verification_data: {
          screenshot_url: screenshotUrl, file_name: file.name, extracted,
          upload_count: newUploadCount, status: "pending_human_review",
          reason: "Low confidence", uploaded_at: new Date().toISOString(),
        },
      }).eq("id", newsletterId);

      await supabase.from("flagged_messages").insert({
        user_id: newsletterId, user_type: "newsletter",
        phone: profile.phone || "",
        content: `Low confidence verification for ${profile.newsletter_name}`,
        flag_reason: "low_confidence_verification",
      });

      return Response.json({
        success: true, status: "pending_review",
        message: "Image was hard to read — we'll review manually. Try a clearer screenshot for faster verification.",
      });
    }

    // Compare metrics
    const comparison = compareMetrics(extracted, profile);

    if (comparison.verified) {
      // Auto-verified
      await supabase.from("newsletter_profiles").update({
        ...comparison.updates,
        verification_status: "screenshot",
        verification_data: {
          screenshot_url: screenshotUrl, file_name: file.name, extracted,
          upload_count: newUploadCount, status: "auto_verified",
          verified_at: new Date().toISOString(),
        },
      }).eq("id", newsletterId);

      // Send verification success via WhatsApp
      const metricsMsg = [
        extracted.subscriber_count ? `${extracted.subscriber_count.toLocaleString()} subscribers` : null,
        extracted.open_rate ? `${extracted.open_rate.toFixed(1)}% open rate` : null,
        extracted.ctr ? `${extracted.ctr.toFixed(1)}% CTR` : null,
      ].filter(Boolean).join(", ");

      if (profile.phone) {
        await sendWhatsAppMessage(
          profile.phone,
          `*${profile.newsletter_name}* is now verified! ✅\n\nConfirmed: ${metricsMsg}${extracted.platform ? ` (via ${extracted.platform})` : ""}\n\nVerified creators get prioritized in matching!`
        );
      }

      return Response.json({
        success: true, status: "verified", message: "Verification successful!",
        metrics: { subscribers: extracted.subscriber_count, openRate: extracted.open_rate, ctr: extracted.ctr, platform: extracted.platform },
      });
    }

    // Discrepancies — flag for review
    await supabase.from("newsletter_profiles").update({
      verification_data: {
        screenshot_url: screenshotUrl, file_name: file.name, extracted,
        discrepancies: comparison.discrepancies,
        upload_count: newUploadCount, status: "discrepancy_review",
        uploaded_at: new Date().toISOString(),
      },
    }).eq("id", newsletterId);

    await supabase.from("flagged_messages").insert({
      user_id: newsletterId, user_type: "newsletter",
      phone: profile.phone || "",
      content: `Verification discrepancy for ${profile.newsletter_name}: ${comparison.discrepancies.join("; ")}`,
      flag_reason: "verification_discrepancy",
    });

    if (profile.phone) {
      await sendWhatsAppMessage(
        profile.phone,
        `We noticed some differences between your reported metrics and the screenshot for *${profile.newsletter_name}*. We'll review and get back to you within 24 hours.`
      );
    }

    return Response.json({
      success: true, status: "review",
      message: "We noticed some differences — we'll review manually.",
      discrepancies: comparison.discrepancies,
    });
  } catch (err) {
    console.error("Upload verify error:", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
