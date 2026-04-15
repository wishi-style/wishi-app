import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
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

export default clerkMiddleware(async (auth, req) => {
  if (process.env.E2E_AUTH_MODE === "true" && req.cookies.get(E2E_CLERK_ID_COOKIE)?.value) {
    return;
  }

  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|api/webhooks|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/webhooks))(.*)",
  ],
};
