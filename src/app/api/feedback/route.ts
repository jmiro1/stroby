import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  let body: {
    introductionId: string;
    userId: string;
    userType: "business" | "newsletter";
    rating: number;
    feedback?: string;
    wouldBookAgain?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { introductionId, userId, userType, rating, feedback, wouldBookAgain } = body;

  if (!introductionId || !userId || !userType || rating == null) {
    return Response.json(
      { error: "introductionId, userId, userType, and rating are required" },
      { status: 400 }
    );
  }

  if (userType !== "business" && userType !== "newsletter") {
    return Response.json(
      { error: "userType must be 'business' or 'newsletter'" },
      { status: 400 }
    );
  }

  if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
    return Response.json(
      { error: "Rating must be an integer between 1 and 5" },
      { status: 400 }
    );
  }

  // Build update payload based on user type
  const updateData: Record<string, unknown> = {};

  if (userType === "business") {
    updateData.business_rating = rating;
    if (feedback) updateData.business_feedback = feedback;
    if (wouldBookAgain != null) updateData.would_book_again = wouldBookAgain;
  } else {
    updateData.newsletter_rating = rating;
    if (feedback) updateData.newsletter_feedback = feedback;
  }

  const { error: updateError } = await supabase
    .from("introductions")
    .update(updateData)
    .eq("id", introductionId);

  if (updateError) {
    console.error("Failed to update introduction with feedback:", updateError);
    return Response.json(
      { error: "Failed to save feedback" },
      { status: 500 }
    );
  }

  // Check if both ratings now exist — if so, mark as completed
  const { data: intro } = await supabase
    .from("introductions")
    .select("id, business_rating, newsletter_rating, newsletter_id")
    .eq("id", introductionId)
    .single();

  if (intro && intro.business_rating != null && intro.newsletter_rating != null) {
    await supabase
      .from("introductions")
      .update({ status: "completed" })
      .eq("id", introductionId);
  }

  // Recalculate avg_match_rating for the newsletter profile
  if (intro?.newsletter_id) {
    const { data: ratedIntros } = await supabase
      .from("introductions")
      .select("business_rating")
      .eq("newsletter_id", intro.newsletter_id)
      .not("business_rating", "is", null);

    if (ratedIntros && ratedIntros.length > 0) {
      const avg =
        ratedIntros.reduce((sum, i) => sum + (i.business_rating ?? 0), 0) /
        ratedIntros.length;

      await supabase
        .from("newsletter_profiles")
        .update({ avg_match_rating: Math.round(avg * 100) / 100 })
        .eq("id", intro.newsletter_id);
    }
  }

  return Response.json({ success: true });
}
