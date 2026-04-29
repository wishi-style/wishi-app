import { unauthorized, forbidden } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { getServerAuth } from "./server-auth";

/**
 * Server-side guard that checks both authentication and role authorization.
 * Reads the user's role from Clerk publicMetadata (propagated to session JWT).
 *
 * Call from Server Components and route group layouts:
 *   const { userId, role } = await requireRole("CLIENT", "ADMIN");
 *
 * Self-heal: if the JWT claim is missing (e.g. the Clerk webhook didn't set
 * publicMetadata.role on signup, or the JWT was issued before metadata was
 * written), we fall back to the Prisma `User.role` and opportunistically
 * write it back into Clerk so future requests get the claim directly from
 * the JWT. The DB row remains the source of truth for THIS request even if
 * the Clerk backfill itself fails.
 */
export async function requireRole(...allowedRoles: UserRole[]) {
  const { userId, sessionClaims, isE2E } = await getServerAuth();

  if (!userId) {
    unauthorized();
  }

  const metadata = sessionClaims?.metadata as
    | { role?: UserRole }
    | undefined;
  let role = metadata?.role;

  if (!role && !isE2E) {
    role = await selfHealRole(userId);
  }

  if (!role || !allowedRoles.includes(role)) {
    forbidden();
  }

  return { userId, role };
}

async function selfHealRole(clerkId: string): Promise<UserRole | undefined> {
  try {
    const { reconcileClerkUser, buildDefaultReconcileDeps } = await import(
      "./reconcile-clerk-user"
    );
    const deps = await buildDefaultReconcileDeps();
    const result = await reconcileClerkUser(clerkId, deps);
    return result.role;
  } catch (err) {
    console.error("requireRole self-heal failed", {
      clerkId,
      err: err instanceof Error ? err.message : err,
    });
    return undefined;
  }
}
