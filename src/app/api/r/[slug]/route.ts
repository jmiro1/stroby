import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createHash } from "crypto";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = createServiceClient();

  try {
    // Look up the transaction by UTM slug
    const { data: transaction, error } = await supabase
      .from("transactions")
      .select("id, agreed_deliverables")
      .eq("utm_slug", slug)
      .maybeSingle();

    if (error) {
      console.error("UTM lookup error:", error);
      return Response.redirect(new URL("https://stroby.ai"), 307);
    }

    if (!transaction || !transaction.agreed_deliverables?.destination_url) {
      return Response.redirect(new URL("https://stroby.ai"), 307);
    }

    const destinationUrl = transaction.agreed_deliverables.destination_url;

    // Hash the IP address for privacy-preserving analytics
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const ipHash = createHash("sha256").update(ip).digest("hex");

    const userAgent = request.headers.get("user-agent") || null;
    const referer = request.headers.get("referer") || null;

    // Log the click asynchronously (don't block the redirect)
    supabase
      .from("utm_clicks")
      .insert({
        transaction_id: transaction.id,
        utm_slug: slug,
        ip_hash: ipHash,
        user_agent: userAgent,
        referer: referer,
      })
      .then(({ error: insertError }) => {
        if (insertError) {
          console.error("Failed to log UTM click:", insertError);
        }
      });

    return Response.redirect(new URL(destinationUrl), 307);
  } catch (err) {
    console.error("UTM redirect error:", err);
    return Response.redirect(new URL("https://stroby.ai"), 307);
  }
}
