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
        ? `Hey ${name}! Just a quick note — I'm actively looking for creators and newsletters in your niche. I'll message you as soon as I find a great fit. In the meantime, is there anything about your ideal partner I should know?`
        : `Hey ${name}! Just a quick note — I'm actively looking for brands that fit your audience. I'll message you as soon as I find a great match. Is there anything about your ideal brand partner I should know?`;
    },
  },
  {
    id: "day3",
    daysAfterSignup: 3,
    messageBuilder: (profile, userType) => {
      const name = (profile.newsletter_name || profile.company_name || profile.name || "there") as string;
      if (userType === "newsletter" && profile.verification_status === "unverified") {
        return `Hey ${name}! Quick tip — verified creators get matched faster. Want me to send you a verification link? Just reply *verify* and I'll set it up.`;
      }
      return `Hey ${name}! Checking in — anything you'd like to update about your profile? The more detail I have, the better matches I can find.`;
    },
  },
  {
    id: "day7",
    daysAfterSignup: 7,
    messageBuilder: (profile, userType) => {
      const name = (profile.newsletter_name || profile.company_name || profile.name || "there") as string;
      return userType === "business"
        ? `Hey ${name}! Week one update — I'm still scanning for the right creators for you. Our network is growing every day. Anything you'd like to adjust about what you're looking for?`
        : `Hey ${name}! Week one update — still looking for the perfect brand match. Our network is growing daily. Any updates on your audience or pricing I should know about?`;
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
