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
2. What they do in the marketing/distribution space
3. What kind of connections or opportunities they're looking for
4. Their niche or industry focus
5. Their email and WhatsApp number (with country code) so we can reach them

Keep messages short (1-2 sentences per response). Ask one thing at a time. Be warm and conversational — this should feel like texting a friend, not filling out a form.

Once you have all the info you need, respond with a message that starts with the exact string "[PROFILE_COMPLETE]" followed by a JSON block on the next line containing the extracted data:
\`\`\`json
{
  "name": "...",
  "role": "...",
  "organization": "...",
  "description": "what they do",
  "looking_for": "what connections/opportunities they want",
  "niche": "their industry/niche",
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
