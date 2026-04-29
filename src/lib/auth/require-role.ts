import { unauthorized, forbidden } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { getServerAuth } from "./server-auth";

/**
 * Server-side guard that checks both authentication and role authorization.
 * Reads `{role, isAdmin}` from Clerk publicMetadata (propagated to session
 * JWT). Admins (`isAdmin=true`) implicitly pass any `requireRole` check —
 * callers don't have to keep listing "ADMIN" alongside the real role.
 *
 * Call from Server Components and route group layouts:
 *   const { userId, role, isAdmin } = await requireRole("CLIENT");
 *
 * Self-heal: if the JWT claim is missing (e.g. the Clerk webhook didn't set
 * publicMetadata on signup, or the JWT was issued before metadata was
 * written), we fall back to the Prisma `User` row and opportunistically
 * write claims back into Clerk so future requests get them directly from
 * the JWT. The DB row remains the source of truth for THIS request even if
 * the Clerk backfill itself fails.
 */
export async function requireRole(...allowedRoles: UserRole[]) {
  const { userId, sessionClaims, isE2E } = await getServerAuth();

  if (!userId) {
    unauthorized();
  }

  const metadata = sessionClaims?.metadata as
    | { role?: UserRole; isAdmin?: boolean }
    | undefined;
  let role = metadata?.role;
  let isAdmin = metadata?.isAdmin === true;

  if (!role && !isE2E) {
    const healed = await selfHeal(userId);
    if (healed) {
      role = healed.role;
      isAdmin = healed.isAdmin;
    }
  }

  if (!role) {
    forbidden();
  }

  // Admins implicitly satisfy any role check. Otherwise role must be in the
  // explicit allow-list.
  if (!isAdmin && !allowedRoles.includes(role)) {
    forbidden();
  }

  return { userId, role, isAdmin };
}

async function selfHeal(
  clerkId: string,
): Promise<{ role: UserRole; isAdmin: boolean } | undefined> {
  try {
    const { reconcileClerkUser, buildDefaultReconcileDeps } = await import(
      "./reconcile-clerk-user"
    );
    const deps = await buildDefaultReconcileDeps();
    const result = await reconcileClerkUser(clerkId, deps);
    return { role: result.role, isAdmin: result.isAdmin };
  } catch (err) {
    console.error("requireRole self-heal failed", {
      clerkId,
      err: err instanceof Error ? err.message : err,
    });
    return undefined;
  }
}
