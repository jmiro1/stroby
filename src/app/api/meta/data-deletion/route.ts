import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import crypto from "crypto";

// Meta Data Deletion Callback
// Meta sends a POST request when a user requests deletion of their data.
// See: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback

function parseSignedRequest(signedRequest: string, appSecret: string) {
  const [encodedSig, payload] = signedRequest.split(".");
  const sig = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const data = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8"));
  const expectedSig = crypto.createHmac("sha256", appSecret).update(payload).digest();

  if (!crypto.timingSafeEqual(sig, expectedSig)) {
    throw new Error("Invalid signature");
  }

  return data;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const signedRequest = formData.get("signed_request") as string;

    if (!signedRequest) {
      return Response.json({ error: "Missing signed_request" }, { status: 400 });
    }

    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
      console.error("META_APP_SECRET not configured");
      return Response.json({ error: "Server configuration error" }, { status: 500 });
    }

    const data = parseSignedRequest(signedRequest, appSecret);
    const userId = data.user_id;

    // Generate a confirmation code for this deletion request
    const confirmationCode = crypto.randomBytes(8).toString("hex");
    const statusUrl = `https://stroby.ai/data-deletion?code=${confirmationCode}`;

    // Log the deletion request — we'll process it asynchronously
    const supabase = createServiceClient();
    await supabase.from("agent_messages").insert({
      direction: "inbound",
      user_type: "business",
      user_id: null,
      phone: `meta_user_${userId}`,
      content: `Data deletion request from Meta. User ID: ${userId}. Confirmation: ${confirmationCode}`,
    });

    // Return the required response format
    return Response.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    console.error("Data deletion callback error:", err);
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
}
