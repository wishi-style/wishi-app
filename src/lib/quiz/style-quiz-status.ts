import { prisma } from "@/lib/prisma";

/**
 * Single source of truth for "has this user finished the style preference
 * quiz?" Five surfaces gate on this — the chat-page hard redirect, the
 * session-detail "Complete Style Quiz" CTA, both standalone + session-scoped
 * style-quiz idempotency checks, and the bookings/success CTA branch.
 *
 * They used to inline the same `findUnique(...).quizCompletedAt` query,
 * which is how PR #98 found one surface (`(client)/sessions/[id]/page.tsx`)
 * had silently drifted to gating on row existence — losing partial-progress
 * users to a redirect loop. Centralising the check here prevents that
 * drift class from coming back.
 */
export async function hasCompletedStyleQuiz(userId: string): Promise<boolean> {
  const profile = await prisma.styleProfile.findUnique({
    where: { userId },
    select: { quizCompletedAt: true },
  });
  return profile?.quizCompletedAt != null;
}
