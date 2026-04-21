// POST /api/stylist/onboarding/advance
//
// Moves the current stylist to the next wizard step. Also flips
// onboardingStatus appropriately and syncs Clerk publicMetadata so the
// edge proxy can redirect without hitting the DB.

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { advance } from "@/lib/stylists/onboarding";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const result = await advance(user.id);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[onboarding/advance] failed", err);
    return NextResponse.json({ error: "Advance failed" }, { status: 500 });
  }
}
