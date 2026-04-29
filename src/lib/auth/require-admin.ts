import { unauthorized, forbidden } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";
import { getServerAuth } from "./server-auth";

export type AdminContext = {
  clerkId: string;
  userId: string;
  user: User;
  isImpersonating: boolean;
  impersonatorClerkId: string | null;
};

export async function requireAdmin(): Promise<AdminContext> {
  const { userId: clerkId, sessionClaims } = await getServerAuth();

  if (!clerkId) {
    unauthorized();
  }

  const metadata = sessionClaims?.metadata as
    | { isAdmin?: boolean }
    | undefined;

  if (metadata?.isAdmin !== true) {
    forbidden();
  }

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user || user.isAdmin !== true) {
    forbidden();
  }

  const act = (sessionClaims as { act?: { sub?: string } } | undefined)?.act;
  const impersonatorClerkId = act?.sub ?? null;

  return {
    clerkId,
    userId: user.id,
    user,
    isImpersonating: impersonatorClerkId !== null,
    impersonatorClerkId,
  };
}
