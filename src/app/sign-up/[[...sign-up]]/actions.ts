"use server";

import { nanoid } from "nanoid";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clearGuestToken, readGuestToken } from "@/lib/auth/guest-token";
import { setE2EAuthCookies } from "@/lib/auth/server-auth";
import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { claimGuestQuizResult } from "@/lib/quiz/claim-guest-quiz";

function generateReferralCode() {
  return `E2E${nanoid(8).toUpperCase()}`;
}

export async function signUpForE2E(formData: FormData) {
  if (!isE2EAuthModeEnabled()) {
    throw new Error("E2E sign-up is only available when E2E_AUTH_MODE=true");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();

  if (!email || !firstName || !lastName) {
    throw new Error("First name, last name, and email are required");
  }
  if (!email.endsWith("@e2e.wishi.test")) {
    throw new Error("E2E sign-up is restricted to @e2e.wishi.test emails");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { clerkId: true, role: true },
  });
  if (existing?.clerkId) {
    await setE2EAuthCookies({ clerkId: existing.clerkId, role: existing.role });
    redirect("/stylists");
  }

  const user = await prisma.user.create({
    data: {
      clerkId: `e2e_${nanoid(16)}`,
      email,
      firstName,
      lastName,
      authProvider: "EMAIL",
      referralCode: generateReferralCode(),
    },
    select: { id: true, clerkId: true, role: true },
  });

  const guestToken = await readGuestToken();
  await claimGuestQuizResult(user.id, guestToken);
  await clearGuestToken();
  await setE2EAuthCookies({
    clerkId: user.clerkId!,
    role: user.role,
  });

  redirect("/stylists");
}
