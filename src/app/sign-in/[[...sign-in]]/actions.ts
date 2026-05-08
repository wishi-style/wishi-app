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

  // `findFirst` (not `findUnique`) — `email` is no longer strictly unique on
  // the User model. The DB-level partial unique on `(email) WHERE deleted_at
  // IS NULL` guarantees at most one *active* row per email, so this query
  // still returns one result for live e2e users while soft-deleted rows
  // can't shadow them.
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
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
