import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

function centsToDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusLabel(status: string): { label: string; tone: "ok" | "pending" | "bad" } {
  switch (status) {
    case "COMPLETED":
      return { label: "Paid", tone: "ok" };
    case "PROCESSING":
      return { label: "Sending", tone: "pending" };
    case "PENDING":
      return { label: "Queued", tone: "pending" };
    case "FAILED":
      return { label: "Failed", tone: "bad" };
    case "SKIPPED":
      return { label: "Skipped", tone: "pending" };
    default:
      return { label: status, tone: "pending" };
  }
}

function triggerLabel(trigger: string): string {
  switch (trigger) {
    case "SESSION_COMPLETED":
      return "Session complete";
    case "LUX_THIRD_LOOK":
      return "Lux milestone (look 3)";
    case "LUX_FINAL":
      return "Lux final";
    default:
      return trigger;
  }
}

export default async function StylistPayoutsPage() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const profile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, stylistType: true, payoutsEnabled: true, stripeConnectId: true },
  });
  if (!profile) return null;

  const payouts = await prisma.payout.findMany({
    where: { stylistProfileId: profile.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      trigger: true,
      amountInCents: true,
      tipInCents: true,
      status: true,
      skippedReason: true,
      createdAt: true,
      stripeTransferId: true,
    },
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const thisMonthTotal = payouts
    .filter((p) => p.createdAt >= monthStart && (p.status === "COMPLETED" || p.status === "PROCESSING"))
    .reduce((sum, p) => sum + p.amountInCents, 0);

  const allTimeTotal = payouts
    .filter((p) => p.status === "COMPLETED" || p.status === "PROCESSING")
    .reduce((sum, p) => sum + p.amountInCents, 0);

  const pendingConnect = profile.stylistType === "PLATFORM" && !profile.payoutsEnabled;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-6 text-3xl font-semibold">Payouts</h1>

      {pendingConnect && (
        <div className="mb-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-2 font-medium">Finish Stripe Connect to receive payouts</div>
          Payout rows are being written for every completed session, but funds
          can&apos;t be transferred until you finish Stripe Connect onboarding.
          <div className="mt-2">
            <Link href="/onboarding/step-12" className="underline">
              Continue Connect setup →
            </Link>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-muted p-4">
          <div className="text-xs uppercase text-muted-foreground">This month</div>
          <div className="mt-1 text-2xl font-semibold">{centsToDollars(thisMonthTotal)}</div>
        </div>
        <div className="rounded-lg border border-muted p-4">
          <div className="text-xs uppercase text-muted-foreground">All time</div>
          <div className="mt-1 text-2xl font-semibold">{centsToDollars(allTimeTotal)}</div>
        </div>
      </div>

      {payouts.length === 0 ? (
        <div className="rounded border border-dashed border-muted p-8 text-center text-sm text-muted-foreground">
          No payouts yet. Your first payout lands the moment a client completes
          their session.
        </div>
      ) : (
        <div className="divide-y divide-muted rounded-lg border border-muted">
          {payouts.map((p) => {
            const s = statusLabel(p.status);
            const toneClass =
              s.tone === "ok"
                ? "text-emerald-700"
                : s.tone === "bad"
                  ? "text-red-700"
                  : "text-amber-700";
            return (
              <div key={p.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{triggerLabel(p.trigger)}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.createdAt.toLocaleDateString()}{" "}
                    {p.tipInCents > 0 && `· includes ${centsToDollars(p.tipInCents)} tip`}
                    {p.skippedReason && ` · ${p.skippedReason.replace(/_/g, " ")}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{centsToDollars(p.amountInCents)}</div>
                  <div className={`text-xs ${toneClass}`}>{s.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
