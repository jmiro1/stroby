// Text-to-Speech using OpenAI TTS
// Beta feature — gated behind VOICE_MESSAGES_ENABLED env var

import { logApiUsage } from "./api-usage";

export function isVoiceEnabled(): boolean {
  return process.env.VOICE_MESSAGES_ENABLED === "true";
}

// Generate an MP3 audio buffer from text
// Returns null if disabled, misconfigured, or on error
export async function generateVoiceMessage(text: string): Promise<Buffer | null> {
  if (!isVoiceEnabled()) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set — voice messages disabled");
    return null;
  }

  // Cap text length to control cost (16MB audio limit from Meta = ~4000 chars max)
  const capped = text.slice(0, 2000);

  try {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "onyx", // warm, measured — fits the Mad Men tone
        input: capped,
        response_format: "mp3",
        speed: 1.0,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("TTS error:", res.status, err);
      return null;
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Log cost
    logApiUsage({
      provider: "openai",
      model: "tts-1",
      route: "voice-message",
      charCount: capped.length,
    });

    return buffer;
  } catch (err) {
    console.error("TTS request failed:", err);
    return null;
  }
}
