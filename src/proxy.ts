import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { E2E_CLERK_ID_COOKIE } from "@/lib/auth/e2e-auth";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing",
  "/lux",
  "/how-it-works",
  "/stylists",
  "/stylists/(.*)",
  "/discover",
  "/feed",
  "/reviews",
  "/board/(.*)",
  "/gift-cards",
  "/match-quiz(.*)",
  // Kept public so the next.config.ts /welcome → /match-quiz redirect can
  // run for unauthed external traffic (Clerk's auth.protect() would
  // otherwise intercept first).
  "/welcome(.*)",
  "/demo",
  "/api/health",
  "/api/webhooks/(.*)",
  "/api/feed",
  "/api/products/(.*)",
  "/sitemap.xml",
  "/robots.txt",
  "/favicon.ico",
]);

// Stylist routes that MUST stay accessible during onboarding — otherwise the
// wizard itself can't call its own save/advance/connect endpoints.
const isOnboardingRoute = createRouteMatcher([
  "/onboarding",
  "/onboarding/(.*)",
  "/stylist/profile/boards",
  "/stylist/profile/boards/(.*)",
  "/api/stylist/onboarding/(.*)",
  "/api/stylist/profile/boards",
  "/api/stylist/profile/boards/(.*)",
  "/api/uploads/(.*)",
]);

const isStylistRoute = createRouteMatcher([
  "/stylist/(.*)",
  "/api/stylist/(.*)",
]);

// Authed *client* surfaces — pages a STYLIST shouldn't be on. If a stylist
// somehow lands here (cached link, returning user, post-signin race), bounce
// them to /stylist/dashboard. Public marketing pages stay accessible to
// stylists who want to browse (/stylists, /feed, /pricing, etc.) — those are
// in `isPublicRoute` above so they never even reach this branch.
const isClientOnlyRoute = createRouteMatcher([
  "/sessions(.*)",
  "/favorites(.*)",
  "/cart(.*)",
  "/orders(.*)",
  "/profile(.*)",
  "/settings(.*)",
  "/checkout(.*)",
  "/bookings(.*)",
  "/matches(.*)",
  "/closet(.*)",
  "/select-plan(.*)",
  "/session-checkout(.*)",
  "/style-quiz(.*)",
]);

// Statuses that mean "wizard complete — stylist can use the full app".
const READY_STATUSES = new Set(["AWAITING_ELIGIBILITY", "ELIGIBLE"]);

export default clerkMiddleware(async (auth, req) => {
  if (process.env.E2E_AUTH_MODE === "true" && req.cookies.get(E2E_CLERK_ID_COOKIE)?.value) {
    return;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  // Stylist onboarding gate: if a stylist hasn't finished the wizard, block
  // any non-onboarding /stylist/* or /api/stylist/* hit. Page routes get a
  // redirect to /onboarding; API routes get a JSON 403 so fetch clients don't
  // parse an HTML redirect body as JSON. The check reads from Clerk
  // publicMetadata (set by saveStep/advance) to avoid a DB round-trip on
  // every request.
  if (isStylistRoute(req) && !isOnboardingRoute(req)) {
    const { sessionClaims } = await auth();
    const metadata = sessionClaims?.metadata as
      | { role?: string; onboardingStatus?: string }
      | undefined;
    if (metadata?.role === "STYLIST") {
      const status = metadata.onboardingStatus;
      if (!status || !READY_STATUSES.has(status)) {
        if (req.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json(
            {
              error: "Onboarding incomplete",
              code: "onboarding_incomplete",
              onboardingStatus: status ?? "NOT_STARTED",
            },
            { status: 403 },
          );
        }
        const url = req.nextUrl.clone();
        url.pathname = "/onboarding";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }

  // Stylist-on-client-surface gate: a STYLIST who lands on a client-only
  // authed surface (e.g. /sessions, /cart) should bounce to their Loveable
  // home (/stylist/dashboard). Admins (isAdmin=true) are exempt — they need
  // to support both surfaces. This complements the /post-signin redirect for
  // any case where the user navigates manually after sign-in.
  if (isClientOnlyRoute(req)) {
    const { sessionClaims } = await auth();
    const metadata = sessionClaims?.metadata as
      | { role?: string; isAdmin?: boolean }
      | undefined;
    if (metadata?.role === "STYLIST" && metadata?.isAdmin !== true) {
      const url = req.nextUrl.clone();
      url.pathname = "/stylist/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/webhooks))(.*)",
  ],
};
