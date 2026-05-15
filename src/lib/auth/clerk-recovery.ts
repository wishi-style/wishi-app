import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

// Marker we add to the recovery redirect's `redirect_url`. If we ever land back
// on /bookings/success carrying this AND still without a Clerk session, the
// caller skips recovery (and falls through to the generic confirmation render)
// so a broken ticket exchange can't ping-pong.
export const CLERK_RECOVERY_MARKER = "__clerk_recovery";
export const CLERK_RECOVERY_MARKER_VALUE = "tried";

// Short enough that a stolen ticket is largely useless; long enough to cover a
// slow browser following the /sign-in?__clerk_ticket=... redirect.
const SIGN_IN_TOKEN_TTL_SECONDS = 300;

export interface BuildClerkRecoveryUrlInput {
  /**
   * `User.id` (Prisma) of the user who paid — typically resolved out of the
   * Stripe Checkout metadata by `retrieveCheckoutMetadata`. Caller hoists the
   * Stripe round-trip so we don't double-fetch on the unhappy path.
   */
  prismaUserId: string | null | undefined;
  appUrl: string;
  returnPath: string;
  // Test seams. Production omits these.
  deps?: {
    findUserById?: (id: string) => Promise<{
      clerkId: string | null;
      deletedAt: Date | null;
    } | null>;
    createSignInToken?: (input: {
      userId: string;
      expiresInSeconds: number;
    }) => Promise<{ token: string }>;
  };
}

/**
 * Build the URL we should redirect a session-less /bookings/success visitor
 * to so Clerk can silently re-establish their session.
 *
 * Returning `null` means recovery is not possible for this request — the
 * caller should fall through to the generic confirmation render. We never
 * surface a Clerk/Prisma error to the user from this path; on any failure
 * we log and return `null`.
 *
 * The Stripe `metadata.userId` is the trust anchor: the Stripe session itself
 * is server-to-server-retrievable proof, and its metadata is set by us at
 * checkout-creation time, so it's unforgeable in transit. We look up the
 * user's `clerkId`, then mint a one-shot Clerk sign-in token. The browser
 * follows `/sign-in?__clerk_ticket=...` which Clerk's `<SignIn>` component
 * auto-consumes, then bounces back to `returnPath` with a fresh session
 * cookie.
 */
export async function buildClerkRecoveryUrl({
  prismaUserId,
  appUrl,
  returnPath,
  deps,
}: BuildClerkRecoveryUrlInput): Promise<string | null> {
  if (!prismaUserId) return null;

  try {
    const findUser =
      deps?.findUserById ??
      ((id: string) =>
        prisma.user.findUnique({
          where: { id },
          select: { clerkId: true, deletedAt: true },
        }));
    const user = await findUser(prismaUserId);
    if (!user?.clerkId || user.deletedAt) return null;

    const createToken =
      deps?.createSignInToken ??
      (async (input) => {
        const client = await clerkClient();
        const tokenResponse = await client.signInTokens.createSignInToken(input);
        return { token: tokenResponse.token };
      });
    const { token } = await createToken({
      userId: user.clerkId,
      expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
    });

    const returnUrl = new URL(returnPath, appUrl);
    returnUrl.searchParams.set(CLERK_RECOVERY_MARKER, CLERK_RECOVERY_MARKER_VALUE);

    const signInUrl = new URL("/sign-in", appUrl);
    signInUrl.searchParams.set("__clerk_ticket", token);
    signInUrl.searchParams.set(
      "redirect_url",
      `${returnUrl.pathname}${returnUrl.search}`,
    );
    return signInUrl.toString();
  } catch (err) {
    // Structured payload for CloudWatch search + raw stack for debugging.
    console.error(
      JSON.stringify({
        event: "clerk_recovery_failed",
        prismaUserId,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
    return null;
  }
}
