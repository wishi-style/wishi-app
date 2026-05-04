import { redirect } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";
import { getServerAuth } from "@/lib/auth/server-auth";
import {
  buildDefaultReconcileDeps,
  parseRoleClaims,
  reconcileClerkUserResilient,
} from "@/lib/auth/reconcile-clerk-user";

export const dynamic = "force-dynamic";

/**
 * Post-signin landing route. Clerk redirects here after sign-in (see
 * `signInFallbackRedirectUrl` in `src/app/layout.tsx`); we resolve the user's
 * role and forward them to the Loveable home for that role:
 *
 *   STYLIST → /stylist/dashboard   (wishi-reimagined home)
 *   CLIENT  → /                    (smart-spark-craft home)
 *
 * Reconciliation: if the JWT claims are missing OR carry a legacy role
 * value (e.g. "ADMIN" from pre-migration sessions), we run
 * `reconcileClerkUserResilient` here so the Prisma row exists and Clerk
 * metadata is best-effort normalized before the user lands on their home
 * page. This is the defense-in-depth layer on top of the `requireRole`
 * self-heal — for users coming through the sign-in funnel, the heal
 * happens before any guard runs.
 *
 * Honors `?redirect_url=` if a deep-link bounced through sign-in — but
 * only when the resolved role can actually use that path. A STYLIST whose
 * Clerk modal opened from a client-only CTA (e.g. /select-plan) gets
 * redirected to /stylist/dashboard instead of bounced into a flow that
 * will redirect them right back. Admin (`isAdmin=true`) is exempt — they
 * may legitimately need to see both surfaces.
 */
type SearchParams = { redirect_url?: string };

const ROLE_HOME: Record<UserRole, string> = {
  CLIENT: "/",
  STYLIST: "/stylist/dashboard",
};

function isSafeRedirect(url: string | undefined): url is string {
  if (!url) return false;
  // Same-origin only — never accept absolute URLs that could redirect off-site.
  return url.startsWith("/") && !url.startsWith("//");
}

/**
 * Conservative path → role match. Mirrors the proxy's `isStylistRoute` /
 * `isClientOnlyRoute` matchers in spirit: stylist-only paths live under
 * /stylist/*; everything else is fair game for CLIENTs (including the
 * marketing homepage). When in doubt, return false so the role-default
 * redirect runs and the user lands somewhere they can actually use.
 */
function pathFitsRole(path: string, role: UserRole | undefined): boolean {
  if (!role) return false;
  const stylistOnly =
    path === "/stylist" || path.startsWith("/stylist/");
  if (role === "STYLIST") return stylistOnly;
  return !stylistOnly;
}

export default async function PostSigninPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { userId, sessionClaims, isE2E } = await getServerAuth();

  if (!userId) {
    redirect("/sign-in");
  }

  const parsed = parseRoleClaims(sessionClaims?.metadata);
  let role = parsed.role;
  let isAdmin = parsed.isAdmin;

  if (parsed.needsReconcile && !isE2E) {
    try {
      const deps = await buildDefaultReconcileDeps();
      const result = await reconcileClerkUserResilient(userId, deps);
      role = result.role;
      isAdmin = result.isAdmin;
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "post_signin_reconcile_failed",
          userId,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  if (isSafeRedirect(params.redirect_url)) {
    if (isAdmin || pathFitsRole(params.redirect_url, role)) {
      redirect(params.redirect_url);
    }
    // Fall through to the role-default — the deep link doesn't fit this
    // user's role and following it would just bounce them through another
    // redirect (or worse, a 403 if a downstream guard hasn't been updated).
  }

  if (role === "STYLIST") {
    redirect(ROLE_HOME.STYLIST);
  }
  redirect(ROLE_HOME.CLIENT);
}
