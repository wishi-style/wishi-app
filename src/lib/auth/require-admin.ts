import { unauthorized, forbidden } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { User } from "@/generated/prisma/client";
import { getServerAuth } from "./server-auth";
import { parseRoleClaims } from "./reconcile-clerk-user";

export type AdminContext = {
  clerkId: string;
  userId: string;
  user: User;
  isImpersonating: boolean;
  impersonatorClerkId: string | null;
};

/**
 * Admin guard. Reads `isAdmin` from Clerk session claims; if the claim is
 * missing or the role is a legacy/unknown value (transition users with
 * pre-migration JWTs), reconcile against the DB so existing admins don't
 * 403 until their JWT rotates with the new claim shape.
 *
 * The Prisma User row is the source of truth — if `User.isAdmin` is false,
 * we still 403 even when the claim says true (defense-in-depth against a
 * stale claim that wasn't yet revoked from Clerk).
 */
export async function requireAdmin(): Promise<AdminContext> {
  const { userId: clerkId, sessionClaims, isE2E } = await getServerAuth();

  if (!clerkId) {
    unauthorized();
  }

  const parsed = parseRoleClaims(sessionClaims?.metadata);

  // If the claim shape is stale, reconcile so the next request has a fresh
  // JWT. We don't gate on the claim's isAdmin value here — the DB check
  // below is the authoritative one.
  if (parsed.needsReconcile && !isE2E) {
    try {
      const { reconcileClerkUser, buildDefaultReconcileDeps } = await import(
        "./reconcile-clerk-user"
      );
      const deps = await buildDefaultReconcileDeps();
      await reconcileClerkUser(clerkId, deps);
    } catch (err) {
      console.error("requireAdmin reconcile failed", {
        clerkId,
        err: err instanceof Error ? err.message : err,
      });
    }
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
