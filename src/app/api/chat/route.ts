import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
  return _anthropic;
}

const SYSTEM_PROMPT = `You are Stroby, an AI Superconnector for all things marketing distribution. You help connect businesses, influencers, content creators, agencies, and anyone else in the marketing world with the right people and opportunities.

The user selected "Other" during onboarding — they don't fit neatly into "business" or "influencer." Your job is to have a friendly, concise conversation to understand:
1. Who they are (name, role, company/project if any)
2. Where they're based (city/country)
3. What they do — a brief description of their work
4. Their main objectives right now (what are they trying to achieve?)
5. What kind of connections or introductions they're looking for
6. What they can offer to others (expertise, services, network, etc.)
7. Their niche or industry focus
8. Their website or LinkedIn (optional but helpful)
9. Their email and WhatsApp number (with country code) so we can reach them

Keep messages short (1-2 sentences per response). Ask one thing at a time. Be warm and conversational — this should feel like texting a friend, not filling out a form. You can combine related questions naturally (e.g., name and location in one message) but don't overwhelm them.

Once you have all the info you need, respond with a message that starts with the exact string "[PROFILE_COMPLETE]" followed by a JSON block on the next line containing the extracted data:
\`\`\`json
{
  "name": "...",
  "role": "...",
  "organization": "...",
  "location": "city, country",
  "description": "what they do",
  "objectives": "what they're trying to achieve right now",
  "looking_for": "what connections/introductions they want",
  "can_offer": "what they bring to the table for others",
  "niche": "their industry/niche",
  "website": "url or null",
  "linkedin": "url or null",
  "email": "...",
  "phone": "..."
}
\`\`\`

After the JSON, add a friendly closing message confirming they're all set.`;

interface ChatRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ChatRequestBody;

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const anthropic = getAnthropic();
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: body.messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const isComplete = text.includes("[PROFILE_COMPLETE]");
    let profileData = null;

    if (isComplete) {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          profileData = JSON.parse(jsonMatch[1]);
        } catch {
          // JSON parse failed, still return the text
        }
      }
    }

    // Strip the JSON block from the display message
    let displayText = text;
    if (isComplete) {
      displayText = text
        .replace("[PROFILE_COMPLETE]", "")
        .replace(/```json[\s\S]*?```/, "")
        .trim();
    }

    return NextResponse.json({
      message: displayText,
      complete: isComplete,
      profileData,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 });
  }
}
