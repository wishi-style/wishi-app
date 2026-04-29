import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth/server-auth";
import {
  buildDefaultReconcileDeps,
  parseRoleClaims,
  reconcileClerkUser,
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
 * `reconcileClerkUser` here so the Prisma row exists and Clerk metadata
 * is normalized before the user lands on their home page. This is the
 * defense-in-depth layer on top of the `requireRole` self-heal — for users
 * coming through the sign-in funnel, the heal happens before any guard runs.
 *
 * Honors `?redirect_url=` if a deep-link bounced through sign-in (e.g.
 * unauthed user clicked /favorites → /sign-in?redirect_url=/favorites →
 * /post-signin?redirect_url=/favorites). The deep link wins over the
 * role-default home.
 */
type SearchParams = { redirect_url?: string };

function isSafeRedirect(url: string | undefined): url is string {
  if (!url) return false;
  // Same-origin only — never accept absolute URLs that could redirect off-site.
  return url.startsWith("/") && !url.startsWith("//");
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

  if (parsed.needsReconcile && !isE2E) {
    try {
      const deps = await buildDefaultReconcileDeps();
      const result = await reconcileClerkUser(userId, deps);
      role = result.role;
    } catch (err) {
      console.error("post-signin reconcile failed", {
        userId,
        err: err instanceof Error ? err.message : err,
      });
    }
  }

  if (isSafeRedirect(params.redirect_url)) {
    redirect(params.redirect_url);
  }

  if (role === "STYLIST") {
    redirect("/stylist/dashboard");
  }

  // Default destination: Loveable's smart-spark-craft client home.
  redirect("/");
}
