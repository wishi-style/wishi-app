import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";

const EMPTY = "—";

function formatBudget(minInCents: number, maxInCents: number): string {
  return `$${Math.round(minInCents / 100)}–${Math.round(maxInCents / 100)}`;
}

function joinList(items: string[] | undefined | null): string {
  if (!items || items.length === 0) return EMPTY;
  return items.join(", ");
}

export async function StyleInfoPanel({ userId }: { userId: string }) {
  const [style, body, budgets, colors, fabrics, patterns, sizes, latestSession] =
    await Promise.all([
      prisma.styleProfile.findUnique({ where: { userId } }),
      prisma.bodyProfile.findUnique({ where: { userId } }),
      prisma.budgetByCategory.findMany({ where: { userId } }),
      prisma.colorPreference.findMany({ where: { userId } }),
      prisma.fabricPreference.findMany({ where: { userId } }),
      prisma.patternPreference.findMany({ where: { userId } }),
      prisma.bodyProfile
        .findUnique({ where: { userId }, include: { sizes: true } })
        .then((b) => b?.sizes ?? []),
      prisma.session.findFirst({
        where: { clientId: userId },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const budgetByCategory = new Map(budgets.map((b) => [b.category, b]));
  const sizeByCategory = new Map(sizes.map((s) => [s.category.toUpperCase(), s.size]));

  const favoriteColors = colors.filter((c) => c.isLiked).map((c) => c.color);
  const avoidColors = colors.filter((c) => !c.isLiked).map((c) => c.color);
  const avoidFabrics = fabrics.filter((f) => f.isDisliked).map((f) => f.fabric);
  const favoritePatterns = patterns.filter((p) => !p.isDisliked).map((p) => p.pattern);

  const sections: { title: string; fields: { label: string; value: string; multiline?: boolean }[] }[] = [
    {
      title: "Goals & lifestyle",
      fields: [
        { label: "Shopping for", value: style?.needsDescription ?? EMPTY },
        { label: "Work environment", value: style?.dressCode ?? EMPTY },
        { label: "Occupation", value: style?.occupation ?? EMPTY },
      ],
    },
    {
      title: "Fit & body",
      fields: [
        { label: "Height", value: body?.height ?? EMPTY },
        { label: "Body type", value: body?.bodyType ?? EMPTY },
        { label: "Fit — tops", value: body?.topFit ?? EMPTY },
        { label: "Fit — bottoms", value: body?.bottomFit ?? EMPTY },
        { label: "Tend to wear", value: style?.typicallyWears ?? EMPTY },
        { label: "Areas to highlight", value: joinList(body?.highlightAreas) },
        { label: "Body notes", value: body?.bodyIssues ?? EMPTY, multiline: true },
      ],
    },
    {
      title: "Sizes",
      fields: [
        { label: "Top size", value: sizeByCategory.get("TOPS") ?? EMPTY },
        { label: "Bottom size", value: sizeByCategory.get("BOTTOMS") ?? EMPTY },
        { label: "Jeans size", value: sizeByCategory.get("JEANS") ?? EMPTY },
        { label: "Dress size", value: sizeByCategory.get("DRESSES") ?? EMPTY },
        { label: "Outerwear size", value: sizeByCategory.get("OUTERWEAR") ?? EMPTY },
        { label: "Shoe size", value: sizeByCategory.get("SHOES") ?? EMPTY },
      ],
    },
    {
      title: "Budget per category",
      fields: [
        {
          label: "Tops",
          value: budgetByCategory.has("TOPS")
            ? formatBudget(budgetByCategory.get("TOPS")!.minInCents, budgetByCategory.get("TOPS")!.maxInCents)
            : EMPTY,
        },
        {
          label: "Bottoms",
          value: budgetByCategory.has("BOTTOMS")
            ? formatBudget(budgetByCategory.get("BOTTOMS")!.minInCents, budgetByCategory.get("BOTTOMS")!.maxInCents)
            : EMPTY,
        },
        {
          label: "Shoes",
          value: budgetByCategory.has("SHOES")
            ? formatBudget(budgetByCategory.get("SHOES")!.minInCents, budgetByCategory.get("SHOES")!.maxInCents)
            : EMPTY,
        },
        {
          label: "Jewelry",
          value: budgetByCategory.has("JEWELRY")
            ? formatBudget(budgetByCategory.get("JEWELRY")!.minInCents, budgetByCategory.get("JEWELRY")!.maxInCents)
            : EMPTY,
        },
        {
          label: "Accessories",
          value: budgetByCategory.has("ACCESSORIES")
            ? formatBudget(
                budgetByCategory.get("ACCESSORIES")!.minInCents,
                budgetByCategory.get("ACCESSORIES")!.maxInCents,
              )
            : EMPTY,
        },
      ],
    },
    {
      title: "Style preferences",
      fields: [
        { label: "Style keywords", value: joinList(style?.stylePreferences) },
        { label: "Favorite colors", value: joinList(favoriteColors) },
        { label: "Colors to avoid", value: joinList(avoidColors) },
        { label: "Favorite patterns", value: joinList(favoritePatterns) },
        { label: "Materials to avoid", value: joinList(avoidFabrics) },
      ],
    },
    {
      title: "Inspiration",
      fields: [{ label: "Style icons", value: joinList(style?.styleIcons) }],
    },
  ];

  const retakeHref = latestSession
    ? `/sessions/${latestSession.id}/style-quiz`
    : "/sessions";

  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <div key={section.title}>
          <h3 className="mb-3 font-display text-base">{section.title}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map((f) => (
              <div
                key={f.label}
                className={f.multiline ? "sm:col-span-2 lg:col-span-3" : undefined}
              >
                <p className="mb-1 font-body text-xs uppercase tracking-wider text-muted-foreground">
                  {f.label}
                </p>
                <p className="font-body text-sm text-foreground">{f.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Link
          href={retakeHref}
          className="inline-flex items-center gap-1.5 font-body text-sm text-primary hover:underline"
        >
          <PencilIcon className="h-3.5 w-3.5" /> Retake style quiz
        </Link>
      </div>
    </div>
  );
}
