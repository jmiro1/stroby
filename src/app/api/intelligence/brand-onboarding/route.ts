import { NextRequest } from "next/server";
import { updateOnboardingData } from "@/lib/intelligence/brand";

export async function POST(request: NextRequest) {
  const secret = process.env.INTELLIGENCE_API_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { brand_id, customer_description, past_sponsors, monthly_budget } = body;

  if (!brand_id || !/^[0-9a-f-]{36}$/.test(brand_id)) {
    return Response.json({ error: "Invalid brand_id" }, { status: 400 });
  }

  const answers: Record<string, string> = {};
  if (customer_description) answers.customer_description = String(customer_description).slice(0, 2000);
  if (past_sponsors) answers.past_sponsors = String(past_sponsors).slice(0, 1000);
  if (monthly_budget) answers.monthly_budget = String(monthly_budget).slice(0, 100);

  if (!Object.keys(answers).length) {
    return Response.json({ error: "No data provided" }, { status: 400 });
  }

  try {
    await updateOnboardingData(brand_id, answers);
    return Response.json({ updated: true, brand_id });
  } catch (e) {
    console.error("brand-onboarding failed:", e);
    return Response.json({ error: "Update failed" }, { status: 500 });
  }
}
