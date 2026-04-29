import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/client";
import {
  E2E_CLERK_ID_COOKIE,
  E2E_IS_ADMIN_COOKIE,
  E2E_ROLE_COOKIE,
  isE2EAuthModeEnabled,
} from "./e2e-auth";

function getCookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: !isE2EAuthModeEnabled() && process.env.NODE_ENV === "production",
  };
}

export async function getServerAuth() {
  if (isE2EAuthModeEnabled()) {
    const cookieStore = await cookies();
    const clerkId = cookieStore.get(E2E_CLERK_ID_COOKIE)?.value ?? null;
    const role = cookieStore.get(E2E_ROLE_COOKIE)?.value as UserRole | undefined;
    const isAdmin = cookieStore.get(E2E_IS_ADMIN_COOKIE)?.value === "true";

    if (clerkId) {
      return {
        userId: clerkId,
        sessionClaims: role
          ? { metadata: { role, isAdmin } }
          : undefined,
        isE2E: true,
      };
    }
  }

  const session = await auth();
  return {
    ...session,
    isE2E: false,
  };
}

export async function getCurrentAuthUser() {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) return null;

  return prisma.user.findUnique({
    where: { clerkId },
  });
}

export async function setE2EAuthCookies({
  clerkId,
  role,
  isAdmin = false,
}: {
  clerkId: string;
  role: UserRole;
  isAdmin?: boolean;
}) {
  if (!isE2EAuthModeEnabled()) {
    throw new Error("E2E auth cookies can only be set when E2E_AUTH_MODE=true");
  }

  const cookieStore = await cookies();
  cookieStore.set(E2E_CLERK_ID_COOKIE, clerkId, getCookieOptions());
  cookieStore.set(E2E_ROLE_COOKIE, role, getCookieOptions());
  cookieStore.set(E2E_IS_ADMIN_COOKIE, isAdmin ? "true" : "false", getCookieOptions());
}

export async function clearE2EAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(E2E_CLERK_ID_COOKIE);
  cookieStore.delete(E2E_ROLE_COOKIE);
  cookieStore.delete(E2E_IS_ADMIN_COOKIE);
}
