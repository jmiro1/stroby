/**
 * URL safety validation — blocks SSRF attacks.
 * Prevents fetching internal/private URLs when scraping brand websites.
 */

import dns from "dns/promises";

const BLOCKED_HOSTS = new Set([
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]",
  "metadata.google.internal", "169.254.169.254",
]);

function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip.startsWith("127.")) return true;
  if (ip === "0.0.0.0") return true;
  // IPv6 loopback/link-local
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fd")) return true;
  return false;
}

export async function validateUrl(url: string): Promise<boolean> {
  if (!url) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!parsed.hostname) return false;
  if (BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  if (parsed.port && parsed.port !== "80" && parsed.port !== "443") return false;

  // Resolve DNS and check for private IPs
  try {
    const addresses = await dns.resolve4(parsed.hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(parsed.hostname).catch(() => [] as string[]);
    const allIPs = [...addresses, ...addresses6];

    if (allIPs.length === 0) return false; // Unresolvable

    for (const ip of allIPs) {
      if (isPrivateIP(ip)) return false;
    }
  } catch {
    return false;
  }

  return true;
}
