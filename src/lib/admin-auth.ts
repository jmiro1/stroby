/**
 * Verify admin auth on `/api/admin/*` routes.
 *
 * Accepts the password via either:
 *   - `Authorization: Bearer <ADMIN_PASSWORD>` header (preferred)
 *   - `?key=<ADMIN_PASSWORD>` query parameter (legacy — admin pages still
 *     send this; tracked as M2 in the security audit)
 *
 * Comparison is constant-time via crypto.timingSafeEqual to prevent
 * timing side-channel attacks. Fail-closed: a missing ADMIN_PASSWORD
 * env var rejects the request (no anonymous fallback).
 */
import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function isAdminAuthed(request: NextRequest): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    console.error("SECURITY: ADMIN_PASSWORD not set — admin routes unreachable");
    return false;
  }

  // Header takes precedence (cleaner — doesn't end up in URL bar / logs)
  const header = request.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) {
    return safeEqual(header.slice(7), expected);
  }

  // Legacy query param. Same constant-time check.
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (typeof key === "string" && key.length > 0) {
    return safeEqual(key, expected);
  }

  return false;
}
