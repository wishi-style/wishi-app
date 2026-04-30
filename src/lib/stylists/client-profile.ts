// Stylist-side view of a client's profile.
//
// Shape mirrors the Loveable stylist export (`wishi-reimagined/src/data/clientProfiles.ts::ClientProfile`)
// so the ported Dashboard + ClientDetailPanel components drop in without prop reshaping.
// The resolver below joins StyleProfile + BodyProfile + BodySize + ColorPreference +
// FabricPreference + PatternPreference + SpecificPreference + BudgetByCategory +
// StylistPrivateNote into the Loveable shape.

import { prisma } from "@/lib/prisma";
import { getPrivateNote } from "@/lib/stylists/private-notes";

export type ViewLoyaltyTier = "new" | "bronze" | "silver" | "gold" | "vip";

export interface ClientProfileView {
  fullName: string;
  initials: string;
  gender: string;
  location: string;
  loyaltyTier: ViewLoyaltyTier;
  totalSessions: number;
  profilePhotoUrl?: string;
  stylingGoal: string;
  bodyIssues: string[];
  bodyIssueNotes: string;
  bodyType: string;
  highlightAreas: string[];
  style: string[];
  styleIcons: string[];
  comfortZone: string;
  typicallyWears: string;
  sizes: Record<string, string>;
  budgets: Record<string, string>;
  fitPreferences: { top: string; bottom: string };
  occupation: string;
  dressCode: string;
  colorsLike: string[];
  colorsDislike: string[];
  fabricsDislike: string[];
  patternsDislike: string[];
  denimFit: string[];
  dressStyles: string[];
  heelPreference: string;
  jewelryType: string[];
  socialLinks: { instagram?: string; pinterest?: string; facebook?: string };
  favoriteLooks: string[];
  previousBoards: { name: string; type: "style" | "mood" }[];
  photos: string[];
  notes: string;
}

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Loveable's view supports 5 tiers (new/bronze/silver/gold/vip) but the
// staging schema only models 3 (BRONZE/GOLD/PLATINUM, with thresholds
// 0-2 / 3-7 / 8+ — see lib/loyalty/service.ts). Map directly; the "silver"
// tier is currently unreachable. Documented gap until the backend grows a
// SILVER tier.
export function mapLoyalty(tier: string | null, totalSessions: number): ViewLoyaltyTier {
  if (totalSessions === 0) return "new";
  switch (tier) {
    case "PLATINUM":
      return "vip";
    case "GOLD":
      return "gold";
    case "BRONZE":
      return "bronze";
    default:
      return "new";
  }
}

// Free-text quiz answers like "Straight, Wide Leg" or "Skinny;Flare" arrive
// as a single string; Loveable's view shape is `string[]`. Split on common
// delimiters so multi-value answers render as multi-chip — single-value
// answers degrade to a single-element array.
export function splitToChips(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Map StyleProfile.comfortZoneLevel (Int 1-10, "1 = Keep it safe, 10 = Push
// my boundaries" per the quiz helper) to Loveable's phrase vocabulary.
export function comfortZoneLabel(level: number | null | undefined): string {
  if (level == null) return "";
  if (level <= 3) return "Stay close";
  if (level <= 7) return "A little outside";
  return "Push my boundaries";
}

// Loveable's socialLinks values are handles ("@feizhen.style", "feizhen_d"),
// not URLs. Extract the trailing path segment from a URL; preserve handles
// that are already in `@handle` form. Instagram convention is `@`-prefixed;
// Pinterest / Facebook are bare.
export function extractHandle(raw: string, prefix: "@" | ""): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.startsWith("@")) return trimmed;
  // Pull the last non-empty path segment from a URL-ish string.
  const segments = trimmed
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean);
  const handle = segments[segments.length - 1] ?? trimmed;
  return prefix + handle;
}

function formatDollarRange(minCents: number, maxCents: number): string {
  const min = Math.round(minCents / 100);
  const max = Math.round(maxCents / 100);
  return `$${min}–$${max}`;
}

/**
 * Aggregate a client's entire profile into the Loveable ClientProfileView
 * shape for the stylist ClientDetailPanel. Null-safe — missing preference
 * rows render as empty arrays or sensible defaults.
 *
 * Gated on the stylist having at least one Session with this client;
 * the caller is expected to enforce that before calling this resolver.
 */
export async function resolveClientProfileView(
  clientUserId: string,
  stylistUserId: string,
): Promise<ClientProfileView | null> {
  const [
    user,
    styleProfile,
    bodyProfile,
    colors,
    fabrics,
    patterns,
    specific,
    budgets,
    socialLinks,
    photos,
    completedSessions,
    profileBoards,
    favoriteBoards,
    privateNote,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: clientUserId },
      select: {
        firstName: true,
        lastName: true,
        gender: true,
        avatarUrl: true,
        loyaltyTier: true,
        locations: {
          select: { city: true, country: true },
          take: 1,
        },
      },
    }),
    prisma.styleProfile.findUnique({ where: { userId: clientUserId } }),
    prisma.bodyProfile.findUnique({
      where: { userId: clientUserId },
      include: { sizes: true },
    }),
    prisma.colorPreference.findMany({ where: { userId: clientUserId } }),
    prisma.fabricPreference.findMany({ where: { userId: clientUserId } }),
    prisma.patternPreference.findMany({ where: { userId: clientUserId } }),
    prisma.specificPreference.findUnique({ where: { userId: clientUserId } }),
    prisma.budgetByCategory.findMany({ where: { userId: clientUserId } }),
    prisma.userSocialLink.findMany({
      where: { userId: clientUserId },
      select: { platform: true, url: true },
    }),
    prisma.userPhoto.findMany({
      where: { userId: clientUserId },
      select: { url: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.session.count({
      where: { clientId: clientUserId, status: "COMPLETED" },
    }),
    // Styleboards this client has received that were featured on a stylist
    // profile — Loveable's "previousBoards" field. Keep it lightweight.
    prisma.board.findMany({
      where: {
        session: { clientId: clientUserId },
        type: { in: ["MOODBOARD", "STYLEBOARD"] },
        sentAt: { not: null },
      },
      select: { id: true, title: true, type: true, sentAt: true },
      orderBy: { sentAt: "desc" },
      take: 10,
    }),
    prisma.favoriteBoard.findMany({
      where: { userId: clientUserId },
      include: { board: { select: { title: true } } },
      take: 10,
    }),
    getPrivateNote(stylistUserId, clientUserId),
  ]);

  if (!user) return null;

  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || "Client";

  const location = user.locations[0]
    ? [user.locations[0].city, user.locations[0].country]
        .filter(Boolean)
        .join(", ")
    : "";

  const sizes: Record<string, string> = {};
  for (const s of bodyProfile?.sizes ?? []) {
    sizes[s.category] = s.size;
  }

  const budgetMap: Record<string, string> = {};
  for (const b of budgets) {
    const label =
      b.category === "TOPS"
        ? "Tops"
        : b.category === "BOTTOMS"
          ? "Bottoms"
          : b.category === "DRESSES"
            ? "Dresses"
            : b.category === "SHOES"
              ? "Shoes"
              : b.category === "ACCESSORIES"
                ? "Accessories"
                : b.category === "OUTERWEAR"
                  ? "Outerwear"
                  : b.category;
    budgetMap[label] = formatDollarRange(b.minInCents, b.maxInCents);
  }

  const social: ClientProfileView["socialLinks"] = {};
  for (const s of socialLinks) {
    const key = s.platform.toLowerCase();
    if (key === "instagram") social.instagram = extractHandle(s.url ?? "", "@");
    else if (key === "pinterest") social.pinterest = extractHandle(s.url ?? "", "");
    else if (key === "facebook") social.facebook = extractHandle(s.url ?? "", "");
  }

  return {
    fullName,
    initials: initialsFrom(fullName),
    gender: user.gender ?? "",
    location,
    loyaltyTier: mapLoyalty(user.loyaltyTier ?? null, completedSessions),
    totalSessions: completedSessions,
    profilePhotoUrl: user.avatarUrl ?? undefined,
    stylingGoal: styleProfile?.needsDescription ?? "",
    // BodyProfile.bodyIssues is a single nullable text field — Loveable's
    // shape splits chips (short labels) from notes (free text). Schema can't
    // distinguish, so we surface the text only as notes; chips stay empty
    // until the schema grows a separate chip-list field.
    bodyIssues: [],
    bodyIssueNotes: bodyProfile?.bodyIssues ?? "",
    bodyType: bodyProfile?.bodyType ?? "",
    highlightAreas: bodyProfile?.highlightAreas ?? [],
    style: styleProfile?.stylePreferences ?? [],
    styleIcons: styleProfile?.styleIcons ?? [],
    comfortZone: comfortZoneLabel(styleProfile?.comfortZoneLevel),
    typicallyWears: styleProfile?.typicallyWears ?? "",
    sizes,
    budgets: budgetMap,
    fitPreferences: {
      top: bodyProfile?.topFit ?? "",
      bottom: bodyProfile?.bottomFit ?? "",
    },
    occupation: styleProfile?.occupation ?? "",
    dressCode: styleProfile?.dressCode ?? "",
    colorsLike: colors.filter((c) => c.isLiked).map((c) => c.color),
    colorsDislike: colors.filter((c) => !c.isLiked).map((c) => c.color),
    fabricsDislike: fabrics.filter((f) => f.isDisliked).map((f) => f.fabric),
    patternsDislike: patterns.filter((p) => p.isDisliked).map((p) => p.pattern),
    denimFit: splitToChips(specific?.denimFit),
    dressStyles: specific?.dressStyles ?? [],
    heelPreference: specific?.heelPreference ?? "",
    jewelryType: splitToChips(specific?.jewelryPreference),
    socialLinks: social,
    favoriteLooks: favoriteBoards
      .map((f) => f.board?.title)
      .filter((t): t is string => !!t),
    previousBoards: profileBoards.map((b) => ({
      name: b.title ?? (b.type === "MOODBOARD" ? "Moodboard" : "Styleboard"),
      type: b.type === "MOODBOARD" ? ("mood" as const) : ("style" as const),
    })),
    photos: photos.map((p) => p.url),
    notes: privateNote?.body ?? "",
  };
}
