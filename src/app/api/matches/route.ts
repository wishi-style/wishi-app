import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cosmeticMatchScore } from "@/lib/matching/score";
import type { Gender } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

/**
 * Lists match-eligible stylists for the current client with a cosmetic match
 * score attached to each. Cosmetic only — the auto-matcher in
 * `lib/services/match.service.ts` does not read this endpoint.
 */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const quizResult = await prisma.matchQuizResult.findFirst({
    where: { userId: viewer.id },
    orderBy: { completedAt: "desc" },
  });

  // Filter parallels the directory at /stylists: match-eligible, live user,
  // and if the client has a gender preference set, the stylist must support it.
  const where: {
    matchEligible: boolean;
    user: { deletedAt: null };
    genderPreference?: { has: Gender };
  } = {
    matchEligible: true,
    user: { deletedAt: null },
  };
  if (quizResult?.genderToStyle) {
    where.genderPreference = { has: quizResult.genderToStyle as Gender };
  }

  const stylists = await prisma.stylistProfile.findMany({
    where,
    include: {
      user: {
        select: { firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });

  const scored = stylists.map((s) => ({
    id: s.id,
    userId: s.userId,
    name: `${s.user.firstName} ${s.user.lastName}`.trim(),
    avatarUrl: s.user.avatarUrl,
    bio: s.bio,
    styleSpecialties: s.styleSpecialties,
    yearsExperience: s.yearsExperience,
    averageRating: s.averageRating,
    isAvailable: s.isAvailable,
    matchScore: quizResult ? cosmeticMatchScore(s, quizResult) : null,
  }));

  // Sort by match score when available; otherwise fall back to DB ordering.
  if (quizResult) {
    scored.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
  }

  return NextResponse.json({ matches: scored });
}
