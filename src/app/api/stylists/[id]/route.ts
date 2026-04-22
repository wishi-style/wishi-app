import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { cosmeticMatchScore } from "@/lib/matching/score";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const stylist = await prisma.stylistProfile.findFirst({
    where: {
      id,
      user: { deletedAt: null },
    },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
    },
  });
  if (!stylist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const viewer = await getCurrentUser();
  let matchScore: number | null = null;
  if (viewer) {
    const quizResult = await prisma.matchQuizResult.findFirst({
      where: { userId: viewer.id },
      orderBy: { completedAt: "desc" },
    });
    // Only surface a match score when the viewer has actually taken the quiz.
    // A neutral score for unquiet users would read as misleading signal in UI.
    if (quizResult) {
      matchScore = cosmeticMatchScore(stylist, quizResult);
    }
  }

  const { user, ...profile } = stylist;
  return NextResponse.json({
    id: profile.id,
    userId: profile.userId,
    name: `${user.firstName} ${user.lastName}`.trim(),
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    bio: profile.bio,
    philosophy: profile.philosophy,
    directorPick: profile.directorPick,
    yearsExperience: profile.yearsExperience,
    styleSpecialties: profile.styleSpecialties,
    genderPreference: profile.genderPreference,
    budgetBrackets: profile.budgetBrackets,
    averageRating: profile.averageRating,
    totalSessionsCompleted: profile.totalSessionsCompleted,
    isAvailable: profile.isAvailable,
    instagramHandle: profile.instagramHandle,
    matchScore,
  });
}
