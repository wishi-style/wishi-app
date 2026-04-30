import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { listClosetItems } from "@/lib/boards/closet.service";
import { mapLoyalty } from "@/lib/stylists/client-profile";
import { getProduct } from "@/lib/inventory/inventory-client";
import { StyleboardBuilder } from "./builder";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ parentBoardId?: string; boardId?: string }>;
}

export default async function NewStyleboardPage({ params, searchParams }: Props) {
  await requireRole("STYLIST");
  const { id: sessionId } = await params;
  const { parentBoardId, boardId: existingBoardId } = await searchParams;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      clientId: true,
      stylistId: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          loyaltyTier: true,
        },
      },
    },
  });
  if (!session) notFound();

  const completedSessions = await prisma.session.count({
    where: { clientId: session.clientId, status: "COMPLETED" },
  });

  let board = existingBoardId
    ? await prisma.board.findUnique({
        where: { id: existingBoardId },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      })
    : await prisma.board.findFirst({
        where: {
          sessionId,
          type: "STYLEBOARD",
          sentAt: null,
          ...(parentBoardId ? { parentBoardId } : { parentBoardId: null }),
        },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      });

  if (!board) {
    const stylistProfile = await prisma.stylistProfile.findUniqueOrThrow({
      where: { userId: session.stylistId ?? "" },
      select: { id: true },
    });
    const created = await prisma.board.create({
      data: {
        type: "STYLEBOARD",
        sessionId,
        stylistProfileId: stylistProfile.id,
        parentBoardId: parentBoardId ?? null,
        isRevision: !!parentBoardId,
      },
    });
    board = { ...created, items: [] };
  }

  const [closetItems, inspiration, cartRows, bodyProfile, budgetRows] =
    await Promise.all([
      listClosetItems({ userId: session.clientId }),
      listInspirationPhotos({ take: 60 }),
      prisma.cartItem.findMany({
        where: { userId: session.clientId, sessionId },
        orderBy: { addedAt: "desc" },
        select: { id: true, inventoryProductId: true, quantity: true },
      }),
      prisma.bodyProfile.findUnique({
        where: { userId: session.clientId },
        select: { sizes: { select: { category: true, size: true } } },
      }),
      prisma.budgetByCategory.findMany({
        where: { userId: session.clientId },
        select: { category: true, minInCents: true, maxInCents: true },
      }),
    ]);

  // Direct-sale id set powers the LookCreator's Shop / Store sub-tabs.
  // Store narrows the inventory grid to MerchandisedProduct rows flagged
  // `isDirectSale = true`; Shop shows the full tastegraph catalog.
  const directSaleRows = await prisma.merchandisedProduct.findMany({
    where: { isDirectSale: true },
    select: { inventoryProductId: true },
  });
  const directSaleProductIds = directSaleRows.map((r) => r.inventoryProductId);

  // Build category-keyed lookups for the LookCreator's stylistContext
  // PDP: client size per category (lowercased free-text key) + client
  // budget range per category (cents → dollars). Both default to empty
  // so the PDP degrades gracefully when the client hasn't filled in
  // either part of their style profile.
  const clientSizesByCategory: Record<string, string> = {};
  for (const s of bodyProfile?.sizes ?? []) {
    if (s.category && s.size)
      clientSizesByCategory[s.category.toLowerCase()] = s.size;
  }
  const clientBudgetsByCategory: Record<string, [number, number]> = {};
  for (const b of budgetRows) {
    clientBudgetsByCategory[b.category.toLowerCase()] = [
      Math.round(b.minInCents / 100),
      Math.round(b.maxInCents / 100),
    ];
  }

  const cartProductDocs = await Promise.all(
    cartRows.map((c) => getProduct(c.inventoryProductId)),
  );

  const clientName =
    [session.client.firstName, session.client.lastName]
      .filter(Boolean)
      .join(" ") || "Client";
  const initials =
    [session.client.firstName?.[0], session.client.lastName?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() || "C";

  // Adapters: shape real DB rows into Loveable's InventoryItem shape so the
  // verbatim-ported builder JSX consumes them unchanged. Empty-array adapters
  // (shopItems, purchasedItems, previousMoodBoardItems, previousStyleBoardItems,
  // storeItems) are deferred follow-ups — chrome renders correctly with [].
  const closetInventoryItems = closetItems.map((c) => ({
    id: c.id,
    image: c.url,
    brand: c.designer ?? "Closet",
    name: c.name ?? "",
    category: "tops" as const,
    colors: c.colors ?? [],
    designer: c.designer ?? undefined,
  }));
  const cartInventoryItems = cartRows.flatMap((c, i) => {
    const doc = cartProductDocs[i];
    if (!doc) return [];
    return [
      {
        id: c.id,
        image: doc.primary_image_url ?? doc.image_urls?.[0] ?? "",
        brand: doc.brand_name,
        name: doc.canonical_name,
        price: `$${Math.round(doc.min_price)}`,
        category: "tops" as const,
        colors: [] as string[],
      },
    ];
  });
  const inspirationInventoryItems = inspiration.map((p) => ({
    id: p.id,
    image: p.url,
    brand: "Inspiration",
    name: p.title ?? "",
    category: "tops" as const,
  }));

  const clientProfile = {
    fullName: clientName,
    initials,
    loyaltyTier: mapLoyalty(
      session.client.loyaltyTier ?? null,
      completedSessions,
    ),
    profilePhotoUrl: session.client.avatarUrl ?? undefined,
    sizes: clientSizesByCategory,
    budgets: Object.fromEntries(
      Object.entries(clientBudgetsByCategory).map(([k, [lo, hi]]) => [
        k,
        `$${lo}–$${hi}`,
      ]),
    ),
  };

  return (
    <StyleboardBuilder
      boardId={board.id}
      sessionId={sessionId}
      isRevision={board.isRevision}
      clientId={session.clientId}
      clientName={clientName}
      clientAvatarUrl={session.client.avatarUrl ?? null}
      clientLoyaltyTier={mapLoyalty(
        session.client.loyaltyTier ?? null,
        completedSessions,
      )}
      initialItems={board.items}
      clientSizesByCategory={clientSizesByCategory}
      clientBudgetsByCategory={clientBudgetsByCategory}
      directSaleProductIds={directSaleProductIds}
      shopItems={[]}
      closetItems={closetInventoryItems}
      cartItems={cartInventoryItems}
      purchasedItems={[]}
      inspirationItems={inspirationInventoryItems}
      previousMoodBoardItems={[]}
      previousStyleBoardItems={[]}
      storeItems={[]}
      clientProfile={clientProfile}
    />
  );
}
