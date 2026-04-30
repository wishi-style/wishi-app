import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon, MessageCircleIcon, SparklesIcon, ShoppingBagIcon } from "lucide-react";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "next/navigation";

export const dynamic = "force-dynamic";

interface SearchParams {
  session_id?: string;
}

interface ResolvedStylist {
  firstName: string;
  avatarUrl: string | null;
}

async function resolveFromCheckout(stripeSessionId: string | undefined): Promise<{
  stylist: ResolvedStylist | null;
  styleSessionId: string | null;
}> {
  if (!stripeSessionId || stripeSessionId === "{CHECKOUT_SESSION_ID}") {
    return { stylist: null, styleSessionId: null };
  }

  let stylistUserId: string | null = null;
  try {
    const checkout = await stripe.checkout.sessions.retrieve(stripeSessionId);
    stylistUserId = (checkout.metadata?.stylistUserId as string) || null;
  } catch {
    return { stylist: null, styleSessionId: null };
  }
  if (!stylistUserId) return { stylist: null, styleSessionId: null };

  const stylistUser = await prisma.user.findUnique({
    where: { id: stylistUserId },
    select: { firstName: true, avatarUrl: true },
  });
  return {
    stylist: stylistUser
      ? { firstName: stylistUser.firstName, avatarUrl: stylistUser.avatarUrl }
      : null,
    styleSessionId: null,
  };
}

export default async function BookingSuccessPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const { stylist } = await resolveFromCheckout(params.session_id);
  const stylistFirstName = stylist?.firstName ?? "your stylist";
  const stylistPhotoUrl = stylist?.avatarUrl ?? null;

  const styleProfile = await prisma.styleProfile.findUnique({
    where: { userId: user.id },
    select: { quizCompletedAt: true },
  });
  const quizDone = !!styleProfile?.quizCompletedAt;

  const latestSession = await prisma.session.findFirst({
    where: { clientId: user.id },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

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
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl">
              Meet <em className="italic text-accent">{stylistFirstName}</em>, your stylist.
            </h1>
            <p className="font-body text-base text-muted-foreground">
              Booking confirmed — she&rsquo;ll take it from here.
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
