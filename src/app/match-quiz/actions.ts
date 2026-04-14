"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { persistMatchQuizAnswers } from "@/lib/quiz/engine";
import { mintGuestToken, readGuestToken } from "@/lib/auth/guest-token";
import { redirect } from "next/navigation";

export async function submitMatchQuiz(answers: Record<string, unknown>) {
  const { userId: clerkId } = await auth();

  let userId: string | null = null;
  let guestToken: string | null = null;

  if (clerkId) {
    // Authenticated user
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    userId = user?.id ?? null;
  } else {
    // Guest — read existing token or mint a new one
    guestToken = await readGuestToken();
    if (!guestToken) {
      guestToken = await mintGuestToken();
    }
  }

  await persistMatchQuizAnswers(answers, guestToken, userId);

  if (clerkId) {
    redirect("/stylists");
  } else {
    redirect("/sign-up");
  }
}
