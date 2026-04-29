"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setE2EAuthCookies } from "@/lib/auth/server-auth";
import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";

export async function signInForE2E(formData: FormData) {
  if (!isE2EAuthModeEnabled()) {
    throw new Error("E2E sign-in is only available when E2E_AUTH_MODE=true");
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Email is required");
  }
  if (!email.endsWith("@e2e.wishi.test")) {
    throw new Error("E2E sign-in is restricted to @e2e.wishi.test emails");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { clerkId: true, role: true, isAdmin: true },
  });
  if (!user?.clerkId) {
    throw new Error("Test user not found");
  }

  await setE2EAuthCookies({
    clerkId: user.clerkId,
    role: user.role,
    isAdmin: user.isAdmin,
  });

  // Mirror production: Clerk's signInFallbackRedirectUrl points at /post-signin
  // which resolves role and forwards to the right Loveable home. Sending the
  // E2E flow through the same route exercises the role-aware redirect end to
  // end instead of hardcoding /sessions for everyone.
  redirect("/post-signin");
}
