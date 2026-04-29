import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { decrypt } from "@/lib/encryption";
import { checkWhatsAppTokenExpiry } from "@/lib/whatsapp-token-check";
import { isAdminAuthed } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!isAdminAuthed(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  const supabase = createServiceClient();

  // Conversations view — return recent conversations grouped by user
  if (view === "conversations") {
    // Get the last 50 messages to find unique users
    const { data: recentMessages } = await supabase
      .from("agent_messages")
      .select("user_id, user_type")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!recentMessages || recentMessages.length === 0) {
      return Response.json({ conversations: [] });
    }

    // Get unique user_ids (preserve order = most recent first)
    const seen = new Set<string>();
    const uniqueUsers: { user_id: string; user_type: string }[] = [];
    for (const msg of recentMessages) {
      if (msg.user_id && !seen.has(msg.user_id)) {
        seen.add(msg.user_id);
        uniqueUsers.push({ user_id: msg.user_id, user_type: msg.user_type });
      }
      if (uniqueUsers.length >= 20) break;
    }

    const conversations = await Promise.all(
      uniqueUsers.map(async ({ user_id, user_type }) => {
        // Fetch profile
        let name = "Unknown";
        let phone = "";
        let niche = "";

        if (user_type === "newsletter") {
          const { data: profile } = await supabase
            .from("newsletter_profiles")
            .select("newsletter_name, owner_name, phone, primary_niche")
            .eq("id", user_id)
            .single();
          if (profile) {
            name = profile.newsletter_name || profile.owner_name;
            phone = profile.phone;
            niche = profile.primary_niche;
          }
        } else if (user_type === "business") {
          const { data: profile } = await supabase
            .from("business_profiles")
            .select("company_name, contact_name, phone, primary_niche")
            .eq("id", user_id)
            .single();
          if (profile) {
            name = profile.company_name || profile.contact_name;
            phone = profile.phone;
            niche = profile.primary_niche;
          }
        }

        // Fetch last 5 messages for this user
        const { data: messages } = await supabase
          .from("agent_messages")
          .select("direction, content, created_at")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(5);

        const decryptedMessages = (messages || []).reverse().map((m) => ({
          direction: m.direction,
          content: decrypt(m.content || ""),
          created_at: m.created_at,
        }));

        // Mask phone number for security
        const maskedPhone = phone && phone.length > 6
          ? phone.slice(0, 4) + "****" + phone.slice(-3)
          : phone;

        return {
          userId: user_id,
          userType: user_type,
          name,
          phone: maskedPhone,
          niche,
          messages: decryptedMessages,
        };
      })
    );

    return Response.json({ conversations });
  }

  // User counts
  const [
    { count: newsletters },
    { count: businesses },
    { count: others },
  ] = await Promise.all([
    supabase.from("newsletter_profiles").select("id", { count: "exact", head: true }),
    supabase.from("business_profiles").select("id", { count: "exact", head: true }),
    supabase.from("other_profiles").select("id", { count: "exact", head: true }),
  ]);

  // All remaining queries in parallel (was sequential — ~400ms saved)
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    { data: verificationData },
    { data: introData },
    { count: messagesInToday },
    { count: messagesOutToday },
    { count: flaggedCount },
    { data: flaggedMessages },
    { data: recentNewsletters },
    { data: recentBusinesses },
    { data: bizNiches },
    { data: allCreators },
    { data: allBrands },
  ] = await Promise.all([
    supabase.from("newsletter_profiles").select("verification_status"),
    supabase.from("introductions").select("status"),
    supabase.from("agent_messages").select("id", { count: "exact", head: true }).eq("direction", "inbound").gte("created_at", `${today}T00:00:00Z`),
    supabase.from("agent_messages").select("id", { count: "exact", head: true }).eq("direction", "outbound").gte("created_at", `${today}T00:00:00Z`),
    supabase.from("flagged_messages").select("id", { count: "exact", head: true }).eq("reviewed", false),
    supabase.from("flagged_messages").select("phone, content, flag_reason, created_at").eq("reviewed", false).order("created_at", { ascending: false }).limit(10),
    supabase.from("newsletter_profiles").select("newsletter_name, primary_niche, subscriber_count, created_at, verification_status").gte("created_at", weekAgo.toISOString()).order("created_at", { ascending: false }),
    supabase.from("business_profiles").select("company_name, primary_niche, budget_range, created_at").gte("created_at", weekAgo.toISOString()).order("created_at", { ascending: false }),
    supabase.from("business_profiles").select("primary_niche"),
    supabase.from("newsletter_profiles").select("id, newsletter_name, owner_name, primary_niche, subscriber_count, audience_reach, platform, email, phone, onboarding_status, verification_status, created_at").order("created_at", { ascending: false }),
    supabase.from("business_profiles").select("id, company_name, contact_name, primary_niche, budget_range, email, phone, onboarding_status, created_at").order("created_at", { ascending: false }),
  ]);

  const verification: Record<string, number> = {};
  for (const row of verificationData || []) {
    const status = (row.verification_status as string) || "unverified";
    verification[status] = (verification[status] || 0) + 1;
  }

  const introStats: Record<string, number> = {};
  for (const row of introData || []) {
    const status = row.status as string;
    introStats[status] = (introStats[status] || 0) + 1;
  }

  const nicheCount: Record<string, number> = {};
  for (const row of bizNiches || []) {
    const niche = (row.primary_niche as string) || "Unknown";
    nicheCount[niche] = (nicheCount[niche] || 0) + 1;
  }

  return Response.json({
    users: {
      newsletters: newsletters || 0,
      businesses: businesses || 0,
      others: others || 0,
      total: (newsletters || 0) + (businesses || 0) + (others || 0),
    },
    verification,
    introductions: introStats,
    messages_today: {
      inbound: messagesInToday || 0,
      outbound: messagesOutToday || 0,
    },
    flagged: {
      unreviewed: flaggedCount || 0,
      recent: flaggedMessages || [],
    },
    recent_signups: {
      newsletters: recentNewsletters || [],
      businesses: recentBusinesses || [],
    },
    niches: nicheCount,
    all_profiles: {
      creators: allCreators || [],
      brands: allBrands || [],
    },
    whatsapp_token: await checkWhatsAppTokenExpiry(),
    generated_at: new Date().toISOString(),
  });
}
