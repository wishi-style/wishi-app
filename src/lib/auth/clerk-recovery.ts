import { clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
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
  stripeSessionId: string | null | undefined;
  appUrl: string;
  returnPath: string;
  // Test seams. Production omits these.
  deps?: {
    retrieveCheckoutSession?: (id: string) => Promise<{
      metadata: Record<string, string> | Record<string, string | null> | null | undefined;
    }>;
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
 * surface a Clerk/Stripe/DB error to the user from this path; on any failure
 * we log and return `null`.
 *
 * The Stripe `session_id` is the trust anchor: it's an unforgeable, server-to-
 * server-retrievable proof that the caller just paid as `metadata.userId`. We
 * use it to look up the user's `clerkId`, then mint a one-shot Clerk sign-in
 * token. The browser follows `/sign-in?__clerk_ticket=...` which Clerk's
 * `<SignIn>` component auto-consumes, then bounces back to `returnPath` with
 * a fresh session cookie.
 */
export async function buildClerkRecoveryUrl({
  stripeSessionId,
  appUrl,
  returnPath,
  deps,
}: BuildClerkRecoveryUrlInput): Promise<string | null> {
  if (!stripeSessionId || stripeSessionId === "{CHECKOUT_SESSION_ID}") {
    return null;
  }

  try {
    const retrieve =
      deps?.retrieveCheckoutSession ??
      ((id: string) => stripe.checkout.sessions.retrieve(id));
    const session = await retrieve(stripeSessionId);
    const stripeMetadataUserId = readUserId(session.metadata);
    if (!stripeMetadataUserId) return null;

    const findUser =
      deps?.findUserById ??
      ((id: string) =>
        prisma.user.findUnique({
          where: { id },
          select: { clerkId: true, deletedAt: true },
        }));
    const user = await findUser(stripeMetadataUserId);
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
    console.error(
      JSON.stringify({
        event: "clerk_recovery_failed",
        stripeSessionId,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

function readUserId(
  metadata: Record<string, string | null> | Record<string, string> | null | undefined,
): string | null {
  if (!metadata) return null;
  const value = metadata["userId"];
  return typeof value === "string" && value.length > 0 ? value : null;
}
