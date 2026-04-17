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
  "/feed",
  "/match-quiz(.*)",
  "/api/health",
  "/api/webhooks/(.*)",
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

// Statuses that mean "wizard complete — stylist can use the full app".
const READY_STATUSES = new Set(["AWAITING_ELIGIBILITY", "ELIGIBLE"]);

export default clerkMiddleware(async (auth, req) => {
  if (process.env.E2E_AUTH_MODE === "true" && req.cookies.get(E2E_CLERK_ID_COOKIE)?.value) {
    return;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }

  // Stylist onboarding gate: if a stylist hasn't finished the wizard, redirect
  // any non-onboarding /stylist/* or /api/stylist/* hit to /onboarding. The
  // check reads from Clerk publicMetadata (set by saveStep/advance) to avoid
  // a DB round-trip on every request.
  if (isStylistRoute(req) && !isOnboardingRoute(req)) {
    const { sessionClaims } = await auth();
    const metadata = sessionClaims?.metadata as
      | { role?: string; onboardingStatus?: string }
      | undefined;
    if (metadata?.role === "STYLIST") {
      const status = metadata.onboardingStatus;
      if (!status || !READY_STATUSES.has(status)) {
        const url = req.nextUrl.clone();
        url.pathname = "/onboarding";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/webhooks))(.*)",
  ],
};
