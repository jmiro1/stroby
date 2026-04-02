import { createServiceClient } from "./supabase";
import { encrypt, decrypt } from "./encryption";

interface MessageInsert {
  direction: "inbound" | "outbound";
  user_type?: string | null;
  user_id?: string | null;
  phone: string;
  content: string;
  whatsapp_message_id?: string | null;
  message_type?: string | null;
  related_introduction_id?: string | null;
  external_id?: string | null;
  media_url?: string | null;
  media_count?: number | null;
}

// Insert an agent message with encrypted content
// Phone is NOT encrypted (needed for lookups), but content is
export async function insertMessage(msg: MessageInsert) {
  const supabase = createServiceClient();
  return supabase.from("agent_messages").insert({
    ...msg,
    content: encrypt(msg.content),
  });
}

// Read and decrypt messages by user_id
export async function readDecryptedMessages(userId: string, limit = 10) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("agent_messages")
    .select("direction, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return data.map((msg) => ({
    direction: msg.direction as string,
    content: decrypt((msg.content as string) || ""),
    created_at: msg.created_at as string,
  }));
}

// Read and decrypt onboarding messages by phone (user_id is null)
export async function readOnboardingMessages(phone: string, limit = 10) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("agent_messages")
    .select("direction, content")
    .eq("phone", phone)
    .is("user_id", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return data.map((msg) => ({
    direction: msg.direction as string,
    content: decrypt((msg.content as string) || ""),
  }));
}
