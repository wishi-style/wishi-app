import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PHASE 10 STUB — Phase 7 replaces the body with an LLM call keyed on the
 * last N messages of the conversation so stylists get suggestions relevant
 * to what the client just said. The shape + route stay identical so the
 * `SuggestedReplies` client component doesn't change when the swap lands.
 *
 * Returns 5 canned opener/closer phrases. Gated in the UI by
 * `NEXT_PUBLIC_FEATURE_AI_SUGGESTED_REPLIES` (off by default) so the feature
 * only surfaces in environments that have opted in — staging/prod stay
 * unpilled until Phase 7 ships.
 */
const STATIC_REPLIES = [
  "Love this direction — anything you'd tweak?",
  "Thinking of a matching bag — want options?",
  "Let me pull a few alternatives.",
  "Size up or stick with current?",
  "Does the fit work for your lifestyle?",
] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { userId: clerkId } = await requireAuth();
  const { sessionId } = await params;

  // Access check: only the session's stylist (or admin) gets replies. We do
  // a lightweight user lookup since we need the internal id for the match.
  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { stylistId: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (user.role !== "ADMIN" && session.stylistId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    replies: [...STATIC_REPLIES],
    source: "stub" as const,
  });
}
