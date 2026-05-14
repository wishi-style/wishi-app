import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRightIcon, MessageCircleIcon, SparklesIcon, ShoppingBagIcon } from "lucide-react";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getServerAuth } from "@/lib/auth/server-auth";
import {
  CLERK_RECOVERY_MARKER,
  CLERK_RECOVERY_MARKER_VALUE,
  buildClerkRecoveryUrl,
} from "@/lib/auth/clerk-recovery";
import { resolveAppUrl } from "@/lib/app-url";
import { hasCompletedStyleQuiz } from "@/lib/quiz/style-quiz-status";

export const dynamic = "force-dynamic";

interface SearchParams {
  session_id?: string;
  __clerk_recovery?: string;
}

interface ResolvedStylist {
  firstName: string;
  avatarUrl: string | null;
}

interface ResolvedCheckout {
  stylist: ResolvedStylist | null;
  userId: string | null;
}

async function resolveFromCheckout(stripeSessionId: string | undefined): Promise<ResolvedCheckout> {
  if (!stripeSessionId || stripeSessionId === "{CHECKOUT_SESSION_ID}") {
    return { stylist: null, userId: null };
  }

  let stylistUserId: string | null = null;
  let userId: string | null = null;
  try {
    const checkout = await stripe.checkout.sessions.retrieve(stripeSessionId);
    stylistUserId = (checkout.metadata?.stylistUserId as string) || null;
    userId = (checkout.metadata?.userId as string) || null;
  } catch {
    return { stylist: null, userId: null };
  }
  if (!stylistUserId) return { stylist: null, userId };

  const stylistUser = await prisma.user.findUnique({
    where: { id: stylistUserId },
    select: { firstName: true, avatarUrl: true },
  });
  return {
    stylist: stylistUser
      ? { firstName: stylistUser.firstName, avatarUrl: stylistUser.avatarUrl }
      : null,
    userId,
  };
}

export default async function BookingSuccessPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;

  // Auto-recovery: Clerk's session can be missing here even on HTTPS staging.
  // The most common driver is the new-signup race — the Clerk frontend SDK
  // hasn't fully persisted the long-lived refresh cookie before the modal
  // closes and `forceRedirectUrl` kicks off the booking flow. By the time the
  // browser bounces back from Stripe (1–3 minutes later), the short-lived JWT
  // is expired and there's nothing for Clerk's middleware to refresh from.
  //
  // The Stripe `session_id` is server-side, unforgeable proof of identity:
  // we look up the paying user via its metadata, mint a one-shot Clerk
  // sign-in token, and bounce through `/sign-in?__clerk_ticket=...` so the
  // <SignIn> component re-establishes the session and lands the user back
  // here authed. The `CLERK_RECOVERY_MARKER` query param is the loop guard
  // for the rare case where ticket consumption fails — second time through,
  // we skip recovery and render the generic confirmation below.
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId && params[CLERK_RECOVERY_MARKER] !== CLERK_RECOVERY_MARKER_VALUE) {
    const appUrl = resolveAppUrl({
      envAppUrl: process.env.APP_URL,
      headers: await headers(),
    });
    const sessionIdParam = params.session_id
      ? `?session_id=${encodeURIComponent(params.session_id)}`
      : "";
    const recoveryUrl = await buildClerkRecoveryUrl({
      stripeSessionId: params.session_id,
      appUrl,
      returnPath: `/bookings/success${sessionIdParam}`,
    });
    if (recoveryUrl) redirect(recoveryUrl);
  }

  // Even after recovery (or when no Clerk session exists and recovery wasn't
  // possible — direct visit, expired ticket, missing metadata), the Stripe
  // `session_id` keeps the page functional: it's server-to-server retrievable
  // proof of who paid, so we degrade to a generic confirmation rather than
  // 401ing.
  const signedInUser = await getCurrentUser().catch(() => null);
  const { stylist, userId: checkoutUserId } = await resolveFromCheckout(params.session_id);
  const userId = signedInUser?.id ?? checkoutUserId;

  const stylistFirstName = stylist?.firstName ?? "your stylist";
  const stylistPhotoUrl = stylist?.avatarUrl ?? null;

  const quizDone = userId ? await hasCompletedStyleQuiz(userId) : false;

  const latestSession = userId
    ? await prisma.session.findFirst({
        where: { clientId: userId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const ctaHref = quizDone
    ? latestSession
      ? `/sessions/${latestSession.id}/chat`
      : "/sessions"
    : latestSession
      ? `/sessions/${latestSession.id}/style-quiz`
      : "/sessions";

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl">
          <div className="relative mx-auto mb-8 h-36 w-36 animate-in fade-in zoom-in-95 duration-700">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-secondary via-background to-accent/20 blur-md" />
            <div className="absolute -inset-2 rounded-full border border-foreground/10" />
            <div className="absolute -inset-5 rounded-full border border-foreground/5" />
            {stylistPhotoUrl ? (
              <Image
                src={stylistPhotoUrl}
                alt={stylistFirstName}
                fill
                sizes="144px"
                className="relative rounded-full object-cover ring-1 ring-foreground/10"
              />
            ) : (
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-secondary text-4xl font-display ring-1 ring-foreground/10">
                {stylistFirstName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="mb-10 animate-in fade-in slide-in-from-bottom-4 space-y-3 text-center duration-700 delay-150">
            <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance md:whitespace-nowrap md:text-5xl">
              {stylist ? (
                <>
                  Meet <em className="italic text-accent">{stylistFirstName}</em>, your stylist.
                </>
              ) : (
                <>Meet your stylist.</>
              )}
            </h1>
            <p className="font-body text-base text-muted-foreground">
              Booking confirmed — they&rsquo;ll take it from here.
            </p>
          </div>

          <div className="mb-6 animate-in fade-in slide-in-from-bottom-6 rounded-lg border border-border bg-card p-6 shadow-sm duration-700 delay-300 md:p-8">
            <p className="mb-5 font-body text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {quizDone ? "Your session begins" : "What happens next"}
            </p>

            {quizDone ? (
              <ul className="space-y-4">
                <li className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60">
                    <MessageCircleIcon className="h-4 w-4 text-foreground" />
                  </div>
                  <p className="pt-1 font-body text-sm text-foreground">
                    {stylistFirstName} is reviewing your style profile right now.
                  </p>
                </li>
                <li className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60">
                    <SparklesIcon className="h-4 w-4 text-foreground" />
                  </div>
                  <p className="pt-1 font-body text-sm text-foreground">
                    Your first style board lands within 48 hours.
                  </p>
                </li>
                <li className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60">
                    <ShoppingBagIcon className="h-4 w-4 text-foreground" />
                  </div>
                  <p className="pt-1 font-body text-sm text-foreground">
                    Shop the looks you love, skip what you don&rsquo;t.
                  </p>
                </li>
              </ul>
            ) : (
              <>
                <ul className="mb-5 space-y-4">
                  <li className="pt-1">
                    <p className="font-body text-sm text-foreground">
                      Take the style quiz — about{" "}
                      <span className="font-semibold">5 minutes</span>.
                    </p>
                    <p className="mt-0.5 font-body text-xs text-muted-foreground">
                      Your taste, fit, lifestyle and goals.
                    </p>
                  </li>
                  <li className="pt-1">
                    <p className="font-body text-sm text-foreground">
                      {stylistFirstName} crafts looks made just for you.
                    </p>
                  </li>
                  <li className="pt-1">
                    <p className="font-body text-sm text-foreground">
                      Shop, save, restyle — your closet evolves with you.
                    </p>
                  </li>
                </ul>
                <p className="border-t border-border pt-4 font-body text-[11px] text-muted-foreground">
                  You only do the quiz once — saved to your profile for every future session.
                </p>
              </>
            )}
          </div>

          <Link
            href={ctaHref}
            className="group flex w-full animate-in fade-in slide-in-from-bottom-8 items-center justify-center gap-2 rounded-full bg-foreground px-6 py-4 font-body text-sm font-medium text-background transition-all duration-700 delay-500 hover:bg-foreground/90 hover:shadow-xl"
          >
            {quizDone ? "Enter your styling room" : "Start my style quiz"}
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
