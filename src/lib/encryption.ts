import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY not configured");
  }
  // Key must be 32 bytes for AES-256. Hash it to ensure correct length.
  return crypto.createHash("sha256").update(key).digest();
}

// Encrypt a string. Returns "iv:tag:ciphertext" in hex.
export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;

  try {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
  } catch {
    // If encryption fails (e.g. no key), return plaintext
    // This allows gradual rollout
    return plaintext;
  }
}

// Decrypt a string. Expects "iv:tag:ciphertext" in hex.
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ciphertext;

  // Check if it looks encrypted (has the iv:tag:data format)
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    // Not encrypted (legacy plain text) — return as-is
    return ciphertext;
  }

  try {
    const key = getKey();
    const iv = Buffer.from(parts[0], "hex");
    const tag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // Decryption failed — might be legacy plain text that happens to have colons
    return ciphertext;
  }
}

// Encrypt sensitive fields in an object (returns new object)
export function encryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string" && result[field]) {
      (result as Record<string, unknown>)[field] = encrypt(result[field] as string);
    }
  }
  return result;
}

// Decrypt sensitive fields in an object (returns new object)
export function decryptFields<T extends Record<string, unknown>>(
  obj: T,
  fields: string[]
): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === "string" && result[field]) {
      (result as Record<string, unknown>)[field] = decrypt(result[field] as string);
    }
  }
  return result;
}
