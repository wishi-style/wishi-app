import { prisma } from "@/lib/prisma";
import { mapGenderToInventory } from "./client-prefilter";
import type { CategoryBucket } from "./adapt-product-doc";

/**
 * Everything the Shop workspace needs to know about the client whose look is
 * being built: client display name (first name only), inventory-side gender,
 * size + budget by chrome category bucket, plus liked / preferred / disliked
 * vocabularies for dislike-filtering + like-ranking + smart defaults.
 *
 * Returned by `loadClientStylingContext({ sessionId })`. The same data is
 * sanitised down to `ClientStylingContextSummary` for transport to the
 * browser (no internal preference lists shipped client-side).
 */
export interface ClientStylingContext {
  clientId: string;
  clientFirstName: string;
  /** "women" | "men" | "unisex" — the value the inventory service expects. */
  inventoryGender: string | undefined;

  /** Chrome bucket → size string (e.g. tops → "M", bottoms → "28"). */
  sizesByCategory: Partial<Record<Exclude<CategoryBucket, "all">, string>>;
  /** Chrome bucket → [minPrice, maxPrice] in whole dollars. */
  budgetsByCategory: Partial<Record<Exclude<CategoryBucket, "all">, [number, number]>>;

  avoidBrands: string[];
  preferredBrands: string[];
  likedColors: string[];
  dislikedColors: string[];
  dislikedFabrics: string[];
  dislikedPatterns: string[];

  /** True if the client has explicitly marked leather as a disliked fabric.
   *  Used by the "Exclude leather" smart default. */
  excludeLeatherByDefault: boolean;
}

/** Subset of `ClientStylingContext` safe to ship to the browser. No
 *  preference vocabularies (those drive server-side filtering only). */
export interface ClientStylingContextSummary {
  clientFirstName: string;
  inventoryGender: string | undefined;
  sizesByCategory: ClientStylingContext["sizesByCategory"];
  budgetsByCategory: ClientStylingContext["budgetsByCategory"];
  likedColorKeys: string[];
  preferredBrandNames: string[];
  /** Whether the leather-exclude smart default should fire on load. */
  excludeLeatherByDefault: boolean;
}

const FABRIC_LEATHER_TOKENS = ["leather", "faux-leather", "faux leather"];

/**
 * Normalise a Prisma-stored body profile size category (free text, e.g.
 * "Tops", "tops", "BOTTOMS") into a chrome bucket. Returns null when the
 * category doesn't map to one of our five buckets.
 */
function bucketFromBodySizeCategory(
  raw: string,
): Exclude<CategoryBucket, "all"> | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (/(top|shirt|blouse|tee|tank|sweater)/.test(v)) return "tops";
  if (/(bottom|pant|jean|trouser|skirt|short)/.test(v)) return "bottoms";
  if (/(outerwear|coat|jacket|blazer)/.test(v)) return "outerwear";
  if (/(shoe|boot|sneaker|sandal|loafer|heel)/.test(v)) return "shoes";
  if (/(accessor|bag|belt|hat|jewelry|scarf|sunglass)/.test(v))
    return "accessories";
  return null;
}

function bucketFromBudgetCategory(
  raw: string,
): Exclude<CategoryBucket, "all"> | null {
  return bucketFromBodySizeCategory(raw);
}

/**
 * Resolve every client-styling signal we need to drive the Shop workspace
 * from a single sessionId. The session row carries the client + stylist
 * pair; everything else is keyed off `clientId`.
 *
 * Returns `null` if the session row is missing. Callers are expected to
 * check (the SSR page and the API route both 404 in that case).
 */
export async function loadClientStylingContext(opts: {
  sessionId: string | null;
}): Promise<ClientStylingContext | null> {
  // Sessionless callers (profile-board styleboard creator) get a zero-state
  // context. The caller is expected to treat null/empty fields gracefully —
  // no client likes, no sizes, no budgets, no dislike-filtering.
  if (!opts.sessionId) {
    return {
      clientId: null,
      firstName: null,
      gender: null,
      sizesByCategory: {},
      budgetsByCategory: {},
      likedBrandIds: [],
      likedColors: [],
      dislikedBrandIds: [],
      dislikedColors: [],
      dislikedListingIds: [],
      stylesLiked: [],
      bodyTypesLiked: [],
      occasionsLiked: [],
    } as unknown as ClientStylingContext;
  }
  const session = await prisma.session.findUnique({
    where: { id: opts.sessionId },
    select: {
      clientId: true,
      client: {
        select: { firstName: true, gender: true },
      },
    },
  });
  if (!session) return null;

  const clientId = session.clientId;

  const [
    bodyProfile,
    budgetRows,
    matchQuiz,
    styleProfile,
    colorPrefs,
    fabricPrefs,
    patternPrefs,
  ] = await Promise.all([
    prisma.bodyProfile.findUnique({
      where: { userId: clientId },
      select: { sizes: { select: { category: true, size: true } } },
    }),
    prisma.budgetByCategory.findMany({
      where: { userId: clientId },
      select: { category: true, minInCents: true, maxInCents: true },
    }),
    prisma.matchQuizResult.findFirst({
      where: { userId: clientId },
      orderBy: { completedAt: "desc" },
      select: { genderToStyle: true },
    }),
    prisma.styleProfile.findUnique({
      where: { userId: clientId },
      select: { avoidBrands: true, preferredBrands: true },
    }),
    prisma.colorPreference.findMany({
      where: { userId: clientId },
      select: { color: true, isLiked: true },
    }),
    prisma.fabricPreference.findMany({
      where: { userId: clientId, isDisliked: true },
      select: { fabric: true },
    }),
    prisma.patternPreference.findMany({
      where: { userId: clientId, isDisliked: true },
      select: { pattern: true },
    }),
  ]);

  const inventoryGender = mapGenderToInventory(
    matchQuiz?.genderToStyle ?? session.client.gender ?? null,
  );

  const sizesByCategory: ClientStylingContext["sizesByCategory"] = {};
  for (const s of bodyProfile?.sizes ?? []) {
    if (!s.category || !s.size) continue;
    const bucket = bucketFromBodySizeCategory(s.category);
    if (bucket) sizesByCategory[bucket] = s.size;
  }

  const budgetsByCategory: ClientStylingContext["budgetsByCategory"] = {};
  for (const b of budgetRows) {
    const bucket = bucketFromBudgetCategory(b.category);
    if (!bucket) continue;
    budgetsByCategory[bucket] = [
      Math.round(b.minInCents / 100),
      Math.round(b.maxInCents / 100),
    ];
  }

  const dislikedFabrics = fabricPrefs.map((f) => f.fabric);
  const excludeLeatherByDefault = dislikedFabrics.some((f) =>
    FABRIC_LEATHER_TOKENS.includes(f.trim().toLowerCase()),
  );

  return {
    clientId,
    clientFirstName: (session.client.firstName ?? "").trim() || "your client",
    inventoryGender,
    sizesByCategory,
    budgetsByCategory,
    avoidBrands: styleProfile?.avoidBrands ?? [],
    preferredBrands: styleProfile?.preferredBrands ?? [],
    likedColors: colorPrefs.filter((c) => c.isLiked).map((c) => c.color),
    dislikedColors: colorPrefs.filter((c) => !c.isLiked).map((c) => c.color),
    dislikedFabrics,
    dislikedPatterns: patternPrefs.map((p) => p.pattern),
    excludeLeatherByDefault,
  };
}

/** Strip a `ClientStylingContext` down to the data safe to send to the
 *  browser. No raw dislike lists — those stay server-side. */
export function toClientContextSummary(
  ctx: ClientStylingContext,
): ClientStylingContextSummary {
  return {
    clientFirstName: ctx.clientFirstName,
    inventoryGender: ctx.inventoryGender,
    sizesByCategory: ctx.sizesByCategory,
    budgetsByCategory: ctx.budgetsByCategory,
    likedColorKeys: ctx.likedColors.map((c) => c.trim().toLowerCase()),
    preferredBrandNames: ctx.preferredBrands.slice(0, 20),
    excludeLeatherByDefault: ctx.excludeLeatherByDefault,
  };
}
