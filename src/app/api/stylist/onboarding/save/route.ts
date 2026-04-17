// POST /api/stylist/onboarding/save
//
// Persists one step's payload. Body shape: { step: number, payload: unknown }.
// Returns { onboardingStep }.

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { saveStep, stepSchemas, type StepNumber } from "@/lib/stylists/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();
    const stepNum = Number(body.step);
    if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > 12) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }
    const schema = stepSchemas[stepNum as StepNumber];
    const parsed = schema.safeParse(body.payload ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await saveStep(user.id, stepNum as StepNumber, parsed.data as never);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Save failed";
    console.error("[onboarding/save] failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
