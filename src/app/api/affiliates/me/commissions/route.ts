/**
 * GET /api/affiliates/me/commissions
 *
 * Returns this affiliate's commissions with optional status filter.
 * Query params: ?status=pending|payable|paid|... (comma-separated for multiple)
 */
import { NextRequest } from "next/server";
import { getAffiliateFromSessionToken } from "@/lib/affiliates/auth";
import { AFFILIATE_CONFIG } from "@/lib/affiliates/config";
import { listCommissionsByAffiliate, getCommissionTotals } from "@/lib/affiliates/queries";
import type { CommissionStatus } from "@/lib/affiliates/types";

const VALID_STATUSES: CommissionStatus[] = [
  "pending",
  "payable",
  "paid",
  "clawback_pending",
  "clawback_applied",
  "cancelled",
];

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get(AFFILIATE_CONFIG.SESSION_COOKIE_NAME)?.value;
  const affiliate = await getAffiliateFromSessionToken(sessionToken);
  if (!affiliate) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  let statuses: CommissionStatus[] | undefined;
  if (statusParam) {
    statuses = statusParam
      .split(",")
      .map((s) => s.trim() as CommissionStatus)
      .filter((s) => VALID_STATUSES.includes(s));
  }
  const limit = parseInt(url.searchParams.get("limit") || "200", 10);

  const [commissions, totals] = await Promise.all([
    listCommissionsByAffiliate(affiliate.id, { statuses, limit }),
    getCommissionTotals(affiliate.id),
  ]);

  return Response.json({ commissions, totals });
}
