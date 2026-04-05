import { createServiceClient } from "./supabase";
import { sendWhatsAppSmart } from "./whatsapp";
import { insertMessage } from "./secure-messages";

interface DripConfig {
  id: string;
  daysAfterSignup: number;
  messageBuilder: (profile: Record<string, unknown>, userType: string) => string;
  condition?: (profile: Record<string, unknown>) => boolean;
}

const DRIPS: DripConfig[] = [
  {
    id: "day1",
    daysAfterSignup: 1,
    messageBuilder: (profile, userType) => {
      const name = (profile.newsletter_name || profile.company_name || profile.name || "there") as string;
      return userType === "business"
        ? `Hey, Stroby here! Just a quick note — I'm actively looking for creators and newsletters in your niche. I'll message you as soon as I find a great fit. Anything about your ideal partner I should know?`
        : `Hey, Stroby here! Just a quick note — I'm actively looking for brands that fit your audience. I'll message you as soon as I find a great match. Anything about your ideal brand partner I should know?`;
    },
  },
  {
    id: "day3",
    daysAfterSignup: 3,
    messageBuilder: (profile, userType) => {
      const name = (profile.newsletter_name || profile.company_name || profile.name || "there") as string;
      if (userType === "newsletter" && profile.verification_status === "unverified") {
        return `Hey, Stroby here! Quick tip — verified creators get matched faster. Want me to send you a verification link? Just reply *verify* and I'll set it up.`;
      }
      return `Hey, Stroby here! Checking in — anything you'd like to update about your profile? The more detail I have, the better matches I can find.`;
    },
  },
  {
    id: "day7",
    daysAfterSignup: 7,
    messageBuilder: (profile, userType) => {
      const name = (profile.newsletter_name || profile.company_name || profile.name || "there") as string;
      return userType === "business"
        ? `Hey, Stroby here! Week one update — I'm still scanning for the right creators for you. Our network is growing every day. Anything you'd like to adjust about what you're looking for?`
        : `Hey, Stroby here! Week one update — still looking for the perfect brand match. Our network is growing daily. Any updates on your audience or pricing I should know about?`;
    },
  },
];

export async function sendEngagementDrips(): Promise<number> {
  const supabase = createServiceClient();
  let dripsSent = 0;

  const tables = [
    { name: "newsletter_profiles", type: "newsletter", nameField: "newsletter_name" },
    { name: "business_profiles", type: "business", nameField: "company_name" },
    { name: "other_profiles", type: "other", nameField: "name" },
  ] as const;

  for (const drip of DRIPS) {
    // Calculate the target signup date
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - drip.daysAfterSignup);
    const dateStr = targetDate.toISOString().split("T")[0];

    for (const table of tables) {
      // Find users who signed up on the target date and haven't received this drip
      const { data: profiles } = await supabase
        .from(table.name)
        .select("*")
        .gte("created_at", `${dateStr}T00:00:00Z`)
        .lt("created_at", `${dateStr}T23:59:59Z`)
        .eq("is_active", true)
        .not("drips_sent", "cs", `{${drip.id}}`);

      if (!profiles) continue;

      for (const profile of profiles) {
        if (!profile.phone) continue;

        // Check condition if any
        if (drip.condition && !drip.condition(profile)) continue;

        const message = drip.messageBuilder(profile, table.type);
        const name = (profile[table.nameField] || "there") as string;

        // Send via smart (text first, template fallback)
        await sendWhatsAppSmart(
          profile.phone,
          message,
          "weekly_update",
          [name, message.slice(name.length + 6)] // Strip the "Hey name! " prefix for template param
        );

        // Log the message
        await insertMessage({
          direction: "outbound",
          user_type: table.type,
          user_id: profile.id,
          phone: profile.phone,
          content: message,
          message_type: `drip_${drip.id}`,
        });

        // Mark drip as sent
        await supabase
          .from(table.name)
          .update({
            drips_sent: [...((profile.drips_sent as string[]) || []), drip.id],
          })
          .eq("id", profile.id);

        dripsSent++;
      }
    }
  }

  return dripsSent;
}

// Post-intro follow-up: 3 days after introduction, check in with both parties
export async function sendPostIntroFollowups(): Promise<number> {
  const supabase = createServiceClient();
  let sent = 0;

  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const dateStr = threeDaysAgo.toISOString().split("T")[0];

  // Find introductions made ~3 days ago that haven't been followed up
  const { data: intros } = await supabase
    .from("introductions")
    .select("id, business_id, newsletter_id, creator_id, creator_type, status, business_profiles(*), newsletter_profiles(*)")
    .eq("status", "introduced")
    .gte("introduced_at", `${dateStr}T00:00:00Z`)
    .lt("introduced_at", `${dateStr}T23:59:59Z`);

  if (!intros) return 0;

  for (const intro of intros) {
    const business = intro.business_profiles as unknown as Record<string, unknown> | null;
    const newsletter = intro.newsletter_profiles as unknown as Record<string, unknown> | null;

    // Message the business
    if (business?.phone) {
      const creatorName = newsletter?.newsletter_name || newsletter?.name || "the creator";
      const msg = `Hey, Stroby here! Just checking in — how's the conversation going with *${creatorName}*? Did you connect? Let me know if you need anything!`;
      await sendWhatsAppSmart(business.phone as string, msg, "follow_up", [
        (business.contact_name || business.company_name || "there") as string,
      ]);
      await insertMessage({
        direction: "outbound", user_type: "business", user_id: business.id as string,
        phone: business.phone as string, content: msg, message_type: "post_intro_followup",
        related_introduction_id: intro.id,
      });
      sent++;
    }

    // Message the creator
    const creatorPhone = newsletter?.phone as string | null;
    if (creatorPhone) {
      const bizName = (business?.company_name || "the brand") as string;
      const msg = `Hey, Stroby here! Just checking in — how's the conversation going with *${bizName}*? Did you connect? Let me know how it went!`;
      await sendWhatsAppSmart(creatorPhone, msg, "follow_up", [
        (newsletter?.newsletter_name || newsletter?.owner_name || "there") as string,
      ]);
      await insertMessage({
        direction: "outbound", user_type: "newsletter",
        user_id: (newsletter?.id || intro.newsletter_id) as string,
        phone: creatorPhone, content: msg, message_type: "post_intro_followup",
        related_introduction_id: intro.id,
      });
      sent++;
    }
  }

  return sent;
}

// Monthly recap — sent on the 1st of each month
export async function sendMonthlyRecaps(): Promise<number> {
  const supabase = createServiceClient();
  const now = new Date();

  // Only run on the 1st of the month
  if (now.getDate() !== 1) return 0;

  let sent = 0;

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const monthName = lastMonth.toLocaleString("en", { month: "long" });

  const tables = [
    { name: "newsletter_profiles", type: "newsletter", nameField: "newsletter_name" },
    { name: "business_profiles", type: "business", nameField: "company_name" },
  ] as const;

  for (const table of tables) {
    const { data: profiles } = await supabase
      .from(table.name)
      .select("*")
      .eq("is_active", true);

    if (!profiles) continue;

    for (const profile of profiles) {
      const record = profile as Record<string, unknown>;
      if (!record.phone) continue;
      const name = (record[table.nameField] || "there") as string;

      // Count matches suggested this month
      const introCol = table.type === "newsletter" ? "newsletter_id" : "business_id";
      const { count: suggested } = await supabase
        .from("introductions").select("id", { count: "exact", head: true })
        .eq(introCol, record.id as string)
        .gte("created_at", lastMonth.toISOString())
        .lte("created_at", lastMonthEnd.toISOString());

      const { count: intros } = await supabase
        .from("introductions").select("id", { count: "exact", head: true })
        .eq(introCol, record.id as string)
        .eq("status", "introduced")
        .gte("introduced_at", lastMonth.toISOString())
        .lte("introduced_at", lastMonthEnd.toISOString());

      // Only send if there was any activity
      if ((suggested || 0) > 0 || (intros || 0) > 0) {
        const msg = `Hey, Stroby here! Your *${monthName}* recap:\n\n📊 ${suggested || 0} match${(suggested || 0) !== 1 ? "es" : ""} suggested\n🤝 ${intros || 0} introduction${(intros || 0) !== 1 ? "s" : ""} made\n\nKeep your profile updated for the best matches. Message me anytime!`;

        await sendWhatsAppSmart(record.phone as string, msg, "weekly_update", [name, msg.slice(22)]);
        await insertMessage({
          direction: "outbound", user_type: table.type, user_id: record.id as string,
          phone: record.phone as string, content: msg, message_type: "monthly_recap",
        });
        sent++;
      }
    }
  }

  return sent;
}
