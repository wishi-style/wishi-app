import { unauthorized, forbidden, redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { getServerAuth } from "./server-auth";
import { parseRoleClaims } from "./reconcile-clerk-user";

/**
 * Default landing page per role. A user who hits a route they're authed for
 * but not allowed on (e.g. STYLIST → /sessions, CLIENT → /stylist/dashboard)
 * is redirected to their home rather than 403'd. This matches the proxy's
 * stylist-on-client-surface behavior — `requireRole` used to drift away
 * from the proxy by forbidding cross-role traffic the proxy would have
 * redirected, surfacing a dead-end "Access denied" page whenever the JWT
 * carried stale or missing metadata claims.
 */
const ROLE_HOME: Record<UserRole, string> = {
  CLIENT: "/",
  STYLIST: "/stylist/dashboard",
};

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
 * pull fresh `{role,isAdmin}` from the DB. The Clerk metadata write that
 * normally accompanies reconciliation is best-effort — see
 * `reconcileClerkUserResilient` — so a Clerk API hiccup doesn't 403 a user
 * whose DB row is correctly identified.
 *
 * Cross-role traffic redirects to that role's home rather than forbidding.
 * `forbidden()` is reserved for users we genuinely can't identify (no
 * userId, no role, self-heal failed).
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
    // Truly unidentifiable — no claims, no DB row, or self-heal threw.
    // The user is signed in but we can't tell what role they have.
    forbidden();
  }

  // Admins implicitly satisfy any role check.
  if (isAdmin) {
    return { userId, role, isAdmin };
  }

  if (allowedRoles.includes(role)) {
    return { userId, role, isAdmin };
  }

  // Wrong role for this surface — send them to their home. Layout will
  // re-run `requireRole` there and resolve cleanly.
  redirect(ROLE_HOME[role]);
}

async function selfHeal(
  clerkId: string,
): Promise<{ role: UserRole; isAdmin: boolean } | undefined> {
  try {
    const { reconcileClerkUserResilient, buildDefaultReconcileDeps } =
      await import("./reconcile-clerk-user");
    const deps = await buildDefaultReconcileDeps();
    const result = await reconcileClerkUserResilient(clerkId, deps);
    return { role: result.role, isAdmin: result.isAdmin };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "require_role_self_heal_failed",
        clerkId,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    return undefined;
  }
}
