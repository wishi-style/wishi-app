import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import {
  E2E_CLERK_ID_COOKIE,
  E2E_IS_ADMIN_COOKIE,
  E2E_ROLE_COOKIE,
} from "@/lib/auth/e2e-auth";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/logout",
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
  // Stripe Hosted Checkout redirects clients here over HTTP on staging; Clerk
  // session cookies are Secure-flagged and don't always survive that hop, so
  // requiring auth here causes an infinite session-refresh loop. The page
  // itself authenticates the booking via the Stripe `session_id` metadata
  // (unforgeable, server-to-server retrieve) and degrades to a generic
  // confirmation when nothing is signed in.
  "/bookings/success(.*)",
  // Kept public so the next.config.ts /welcome → /match-quiz redirect can
  // run for unauthed external traffic (Clerk's auth.protect() would
  // otherwise intercept first).
  "/welcome(.*)",
  // /onboarding entrypoint is dual-purpose: stylists mid-wizard resume here,
  // and guests/clients get redirected to /match-quiz (Loveable parity). The
  // page handler does the routing, so the bare path must be public. Sub-paths
  // (/onboarding/N) stay authed via the catch-all elsewhere.
  "/onboarding",
  "/api/health",
  "/api/webhooks/(.*)",
  "/api/feed",
  "/api/products/(.*)",
  // Image proxy: per-prefix auth handled inside the route handler itself
  // (e.g. inspiration/avatars/boards = public, closet/chat = signed-in).
  // Listing here so Clerk's auth.protect() doesn't blanket-block the
  // public prefixes that anonymous SharedBoard pages need.
  "/api/images/(.*)",
  // Worker-secret-auth'd admin route: re-syncs DB → Clerk publicMetadata.
  // Targets the exact users (admins) whose Clerk claims are broken, so
  // requireAdmin() can't gate it — has to authenticate via x-worker-secret
  // inside the handler. Public bypass keeps Clerk's auth.protect() out of
  // the way of that handler-level check.
  "/api/admin/resync-clerk-claims",
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

const isE2EMode = process.env.E2E_AUTH_MODE === "true";

// In E2E mode we bypass clerkMiddleware entirely. clerkMiddleware's
// dev-browser bootstrap pings Clerk's API on first init, which trips the
// dev-tier rate-limit ceiling under parallel Playwright workers and
// surfaces as a `too_many_requests` JSON body for the page response. The
// e2e harness uses a cookie-based auth bridge (E2E_CLERK_ID_COOKIE);
// server components / actions look up the user via getServerAuth() rather
// than Clerk's bare auth(), so no Clerk wiring is needed in this mode.
function e2eProxy(req: NextRequest): NextResponse | undefined {
  if (isPublicRoute(req)) return undefined;

  const e2eClerkId = req.cookies.get(E2E_CLERK_ID_COOKIE)?.value;
  if (!e2eClerkId) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const role = req.cookies.get(E2E_ROLE_COOKIE)?.value;
  const isAdmin = req.cookies.get(E2E_IS_ADMIN_COOKIE)?.value === "true";

  if (isClientOnlyRoute(req) && role === "STYLIST" && !isAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = "/stylist/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return undefined;
}

const realProxy = clerkMiddleware(async (auth, req) => {
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

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (isE2EMode) {
    return e2eProxy(req) ?? NextResponse.next();
  }
  return realProxy(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/webhooks))(.*)",
  ],
};
