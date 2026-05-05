import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ImpersonationBanner } from "./impersonation-banner";

/**
 * Server component — renders the impersonation banner when the current
 * session has an `act` claim (actor token flow). Mounted in the root
 * layout so it appears regardless of route group.
 *
 * Mounted in the ROOT layout, this component renders for every response
 * — including the 404 page that Next.js falls back to for missing static
 * assets (e.g. a broken `<img src="/foo.jpg">`). Those requests bypass
 * `clerkMiddleware` (the proxy matcher excludes static-shaped paths),
 * which makes `auth()` throw "Clerk can't detect usage of clerkMiddleware".
 * That single throw cascades into a 500 for the whole 404 render — and
 * 18 of those in one minute is what lit up `wishi-staging-alb-5xx-ratio`
 * on 2026-05-05. Treat a missing Clerk context as "no impersonation".
 */
export async function ImpersonationBannerMount() {
  let session: Awaited<ReturnType<typeof auth>>;
  try {
    session = await auth();
  } catch {
    return null;
  }
  const act = (
    session.sessionClaims as { act?: { sub?: string } } | undefined
  )?.act;
  if (!act?.sub || !session.userId) return null;

  const target = await prisma.user.findUnique({
    where: { clerkId: session.userId },
    select: { firstName: true, lastName: true, email: true },
  });
  const username = target
    ? `${target.firstName} ${target.lastName}`
    : undefined;

  return <ImpersonationBanner username={username} />;
}
