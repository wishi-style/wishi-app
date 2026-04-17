import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { ImpersonationBanner } from "./impersonation-banner";

/**
 * Server component — renders the impersonation banner when the current
 * session has an `act` claim (actor token flow). Mounted in the root
 * layout so it appears regardless of route group.
 */
export async function ImpersonationBannerMount() {
  const session = await auth();
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
