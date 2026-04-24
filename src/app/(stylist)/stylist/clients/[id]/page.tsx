import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function StylistClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("STYLIST");
  const me = await getCurrentAuthUser();
  if (!me) return null;

  const { id: clientId } = await params;

  const hasSession = await prisma.session.count({
    where: { clientId, stylistId: me.id },
  });
  if (hasSession === 0) notFound();

  const [client, styleProfile, bodyProfile, colors, budgets, sessions] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: clientId },
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          email: true,
          gender: true,
          loyaltyTier: true,
        },
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
  const initials =
    `${client.firstName?.[0] ?? ""}${client.lastName?.[0] ?? ""}`.toUpperCase() ||
    "?";
  const loyaltyLabel =
    client.loyaltyTier === "PLATINUM"
      ? "VIP"
      : client.loyaltyTier === "GOLD"
        ? "Gold"
        : client.loyaltyTier === "BRONZE"
          ? "Bronze"
          : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      {/* Header */}
      <Link
        href="/stylist/clients"
        className="inline-flex items-center gap-2 mb-6 font-body text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back to clients
      </Link>

      <div className="flex items-center gap-4 mb-8">
        <Avatar className="h-16 w-16">
          {client.avatarUrl ? (
            <AvatarImage src={client.avatarUrl} alt={client.firstName ?? ""} />
          ) : null}
          <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-lg">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl">
              {client.firstName} {client.lastName}
            </h1>
            {loyaltyLabel && (
              <Badge
                variant="outline"
                className="rounded-sm text-[10px] font-body font-medium border-0 bg-secondary text-secondary-foreground"
              >
                {loyaltyLabel}
              </Badge>
            )}
          </div>
          <p className="font-body text-sm text-muted-foreground mt-0.5">
            {client.gender ?? "—"} · {sessions.length} session
            {sessions.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Style profile */}
      <Section title="Style profile">
        {styleProfile ? (
          <Card>
            <Row label="Style preferences">
              {styleProfile.stylePreferences.join(", ") || "—"}
            </Row>
            <Row label="Style icons">
              {styleProfile.styleIcons.join(", ") || "—"}
            </Row>
            <Row label="Dress code">{styleProfile.dressCode ?? "—"}</Row>
            <Row label="Typically wears">
              {styleProfile.typicallyWears ?? "—"}
            </Row>
            <Row label="Occupation">{styleProfile.occupation ?? "—"}</Row>
            <Row label="Comfort zone">
              {styleProfile.comfortZoneLevel ?? "—"} / 10
            </Row>
            {styleProfile.needsDescription && (
              <Row label="What they need">
                {styleProfile.needsDescription}
              </Row>
            )}
          </Card>
        ) : (
          <Empty>Style quiz not yet completed.</Empty>
        )}
      </Section>

      <Section title="Body profile">
        {bodyProfile ? (
          <Card>
            <Row label="Body type">{bodyProfile.bodyType ?? "—"}</Row>
            <Row label="Height">{bodyProfile.height ?? "—"}</Row>
            <Row label="Top fit">{bodyProfile.topFit ?? "—"}</Row>
            <Row label="Bottom fit">{bodyProfile.bottomFit ?? "—"}</Row>
            <Row label="Highlight areas">
              {bodyProfile.highlightAreas.join(", ") || "—"}
            </Row>
            {bodyProfile.bodyIssues && (
              <Row label="Fit notes">{bodyProfile.bodyIssues}</Row>
            )}
            {bodyProfile.sizes.length > 0 && (
              <Row label="Sizes">
                {bodyProfile.sizes
                  .map((s) => `${s.category}: ${s.size}`)
                  .join(" · ")}
              </Row>
            )}
          </Card>
        ) : (
          <Empty>Body profile not yet completed.</Empty>
        )}
      </Section>

      <Section title="Colors">
        <Card>
          <Row label="Loves">{likedColors.join(", ") || "—"}</Row>
          <Row label="Avoids">{dislikedColors.join(", ") || "—"}</Row>
        </Card>
      </Section>

      <Section title="Budget">
        {budgets.length === 0 ? (
          <Empty>Not specified.</Empty>
        ) : (
          <Card>
            {budgets.map((b) => (
              <Row key={b.id} label={b.category}>
                ${Math.round(b.minInCents / 100)} – $
                {Math.round(b.maxInCents / 100)}
              </Row>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Session history">
        <Card>
          {sessions.map((s) => {
            const planLabel =
              s.planType === "LUX"
                ? "✦ Lux"
                : s.planType === "MAJOR"
                  ? "Major"
                  : "Mini";
            return (
              <Link
                key={s.id}
                href={`/stylist/sessions/${s.id}/workspace`}
                className="flex items-center justify-between border-b border-border p-4 last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm">{planLabel}</span>
                    <span className="font-body text-[11px] text-muted-foreground">
                      {s.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="font-body text-[11px] text-muted-foreground mt-0.5">
                    {(s.completedAt ?? s.createdAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </p>
                </div>
                {s.rating != null && (
                  <div className="font-body text-sm text-foreground">
                    {"★".repeat(s.rating)}
                  </div>
                )}
              </Link>
            );
          })}
        </Card>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border bg-card">
      {children}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4">
      <div className="font-body text-xs uppercase tracking-wider text-muted-foreground min-w-0">
        {label}
      </div>
      <div className="font-body text-sm text-foreground text-right">
        {children}
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center font-body text-sm text-muted-foreground">
      {children}
    </div>
  );
}
