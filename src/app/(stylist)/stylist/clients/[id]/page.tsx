import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Stylist view of a single client they've worked with. Surfaces the client's
// StyleProfile / BodyProfile / ColorPreference / BudgetByCategory rows and
// session history with the current stylist.

export default async function StylistClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("STYLIST");
  const me = await getCurrentAuthUser();
  if (!me) return null;

  const { id: clientId } = await params;

  // Authorization: stylist can only see clients they've had a session with.
  const hasSession = await prisma.session.count({
    where: { clientId, stylistId: me.id },
  });
  if (hasSession === 0) notFound();

  const [client, styleProfile, bodyProfile, colors, budgets, sessions] = await Promise.all([
    prisma.user.findUnique({
      where: { id: clientId },
      select: { firstName: true, lastName: true, avatarUrl: true, email: true, gender: true },
    }),
    prisma.styleProfile.findUnique({ where: { userId: clientId } }),
    prisma.bodyProfile.findUnique({
      where: { userId: clientId },
      include: { sizes: true },
    }),
    prisma.colorPreference.findMany({ where: { userId: clientId } }),
    prisma.budgetByCategory.findMany({ where: { userId: clientId } }),
    prisma.session.findMany({
      where: { clientId, stylistId: me.id },
      select: {
        id: true,
        planType: true,
        status: true,
        createdAt: true,
        completedAt: true,
        rating: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!client) notFound();

  const likedColors = colors.filter((c) => c.isLiked).map((c) => c.color);
  const dislikedColors = colors.filter((c) => !c.isLiked).map((c) => c.color);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center gap-4">
        {client.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={client.avatarUrl}
            alt={client.firstName}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-xl font-medium">
            {(client.firstName[0] ?? "?").toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold">
            {client.firstName} {client.lastName}
          </h1>
          <div className="text-sm text-muted-foreground">
            {client.gender ?? "—"}
          </div>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Style profile
        </h2>
        <Card>
          {styleProfile ? (
            <>
              <Row label="Style preferences">{styleProfile.stylePreferences.join(", ") || "—"}</Row>
              <Row label="Style icons">{styleProfile.styleIcons.join(", ") || "—"}</Row>
              <Row label="Dress code">{styleProfile.dressCode ?? "—"}</Row>
              <Row label="Typically wears">{styleProfile.typicallyWears ?? "—"}</Row>
              <Row label="Occupation">{styleProfile.occupation ?? "—"}</Row>
              <Row label="Comfort zone">{styleProfile.comfortZoneLevel ?? "—"} / 10</Row>
              {styleProfile.needsDescription && (
                <Row label="What they need">{styleProfile.needsDescription}</Row>
              )}
            </>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Style quiz not yet completed.
            </div>
          )}
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Body profile
        </h2>
        <Card>
          {bodyProfile ? (
            <>
              <Row label="Body type">{bodyProfile.bodyType ?? "—"}</Row>
              <Row label="Height">{bodyProfile.height ?? "—"}</Row>
              <Row label="Top fit">{bodyProfile.topFit ?? "—"}</Row>
              <Row label="Bottom fit">{bodyProfile.bottomFit ?? "—"}</Row>
              <Row label="Highlight areas">
                {bodyProfile.highlightAreas.join(", ") || "—"}
              </Row>
              {bodyProfile.bodyIssues && <Row label="Fit notes">{bodyProfile.bodyIssues}</Row>}
              {bodyProfile.sizes.length > 0 && (
                <Row label="Sizes">
                  {bodyProfile.sizes.map((s) => `${s.category}: ${s.size}`).join(" · ")}
                </Row>
              )}
            </>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Body profile not yet completed.
            </div>
          )}
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Colors
        </h2>
        <Card>
          <Row label="Loves">{likedColors.join(", ") || "—"}</Row>
          <Row label="Avoids">{dislikedColors.join(", ") || "—"}</Row>
        </Card>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Budget
        </h2>
        <Card>
          {budgets.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Not specified.</div>
          ) : (
            budgets.map((b) => (
              <Row key={b.id} label={b.category}>
                ${Math.round(b.minInCents / 100)} – ${Math.round(b.maxInCents / 100)}
              </Row>
            ))
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Session history
        </h2>
        <Card>
          {sessions.map((s) => (
            <Link
              key={s.id}
              href={`/stylist/sessions/${s.id}`}
              className="flex items-center justify-between border-b border-muted p-4 last:border-b-0 hover:bg-muted/30"
            >
              <div>
                <div className="font-medium">{s.planType}</div>
                <div className="text-xs text-muted-foreground">{s.status}</div>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {(s.completedAt ?? s.createdAt).toLocaleDateString()}
                {s.rating != null && <div>{"★".repeat(s.rating)}</div>}
              </div>
            </Link>
          ))}
        </Card>
      </section>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-muted rounded-lg border border-muted">{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 text-sm">
      <div className="min-w-0 text-muted-foreground">{label}</div>
      <div className="text-right">{children}</div>
    </div>
  );
}
