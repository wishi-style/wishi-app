import { unauthorized, forbidden } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { getServerAuth } from "./server-auth";
import { parseRoleClaims } from "./reconcile-clerk-user";

/**
 * Server-side guard that checks both authentication and role authorization.
 * Reads `{role, isAdmin}` from Clerk publicMetadata (propagated to session
 * JWT). Admins (`isAdmin=true`) implicitly pass any `requireRole` check —
 * callers don't have to keep listing "ADMIN" alongside the real role.
 *
 * Call from Server Components and route group layouts:
 *   const { userId, role, isAdmin } = await requireRole("CLIENT");
 *
 * Self-heal: if the JWT carries an unknown / legacy role (e.g. "ADMIN" from
 * before the schema change) or is missing the isAdmin claim entirely, we
 * pull fresh `{role,isAdmin}` from the DB and write them back to Clerk so
 * the next JWT rotation has normalized claims. The DB row remains the
 * source of truth for THIS request even if the Clerk backfill itself fails.
 */
export async function requireRole(...allowedRoles: UserRole[]) {
  const { userId, sessionClaims, isE2E } = await getServerAuth();

  if (!userId) {
    unauthorized();
  }

  const parsed = parseRoleClaims(sessionClaims?.metadata);
  let role = parsed.role;
  let isAdmin = parsed.isAdmin;

  if (parsed.needsReconcile && !isE2E) {
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
