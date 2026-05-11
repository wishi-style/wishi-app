import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { listClosetItems } from "@/lib/boards/closet.service";
import { mapLoyalty } from "@/lib/stylists/client-profile";
import { clientDisplayName, clientInitials } from "@/lib/users/display-name";
import { getProduct, getFilters } from "@/lib/inventory/inventory-client";
import { loadShopInventory } from "@/lib/inventory/shop-inventory.service";
import {
  loadClientStylingContext,
  toClientContextSummary,
} from "@/lib/inventory/client-context";
import {
  adaptProductDoc,
  bucketCategory,
} from "@/lib/inventory/adapt-product-doc";
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
          email: true,
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

  // Direct-sale id set powers the LookCreator's Shop / Store sub-tabs.
  // Store narrows the inventory grid to MerchandisedProduct rows flagged
  // `isDirectSale = true`; Shop shows the full tastegraph catalog.
  const directSaleRows = await prisma.merchandisedProduct.findMany({
    where: { isDirectSale: true },
    select: { inventoryProductId: true },
  });
  const directSaleProductIds = directSaleRows.map((r) => r.inventoryProductId);

  // Parallel fan-out: closet/inspiration/cart from DB, shop inventory +
  // facets + store + cart hydration from tastegraph. The shop call goes
  // through `loadShopInventory` so smart defaults + dislike filtering +
  // adaptation are identical between SSR and the paginated client fetches.
  const [
    closetItems,
    inspiration,
    cartRows,
    clientCtx,
    initialShop,
    facets,
    storeProductDocs,
  ] = await Promise.all([
    listClosetItems({ userId: session.clientId }),
    listInspirationPhotos({ take: 60 }),
    prisma.cartItem.findMany({
      where: { userId: session.clientId, sessionId },
      orderBy: { addedAt: "desc" },
      select: { id: true, inventoryProductId: true, quantity: true },
    }),
    loadClientStylingContext({ sessionId }),
    loadShopInventory({ sessionId, page: 1, pageSize: 60 }),
    getFilters(),
    Promise.all(
      directSaleProductIds.slice(0, 60).map((id) => getProduct(id)),
    ),
  ]);

  // Cart items need their tastegraph product doc hydrated separately because
  // CartItem.id is the row id, not the underlying inventoryProductId. We fan
  // out one getProduct per row (cached server-side for 5min) and stitch the
  // results back together preserving the CartItem.id as the chrome id.
  const cartProductDocs = await Promise.all(
    cartRows.map((c) => getProduct(c.inventoryProductId)),
  );

  const storeInventoryItems = storeProductDocs.flatMap((doc) =>
    doc ? [adaptProductDoc(doc)] : [],
  );
  const cartInventoryItems = cartRows.flatMap((c, i) => {
    const doc = cartProductDocs[i];
    if (!doc) return [];
    return [{ ...adaptProductDoc(doc), id: c.id, inventoryProductId: doc.id }];
  });

  const clientName = clientDisplayName(
    session.client.firstName,
    session.client.lastName,
    session.client.email,
  );
  const initials = clientInitials(
    session.client.firstName,
    session.client.lastName,
    session.client.email,
  );

  // Closet + inspiration items shape into the chrome's InventoryItem.
  const closetInventoryItems = closetItems.map((c) => ({
    id: c.id,
    image: c.url,
    brand: c.designer ?? "Closet",
    name: c.name ?? "",
    category: bucketCategory(c.category),
    colors: c.colors ?? [],
    designer: c.designer ?? undefined,
    season:
      (c.season?.toLowerCase() as
        | "spring"
        | "summer"
        | "fall"
        | "winter"
        | undefined) ?? undefined,
  }));
  const inspirationInventoryItems = inspiration.map((p) => ({
    id: p.id,
    image: p.url,
    brand: "Inspiration",
    name: p.title ?? "",
    category: "tops" as const,
  }));

  // The chrome's existing `clientSizesByCategory` / `clientBudgetsByCategory`
  // props use lowercased free-text category keys (so the PDP can look up
  // sizes by `"tops"`, `"bottoms"`, etc.). Keep that shape — derive from
  // the now-canonical ClientStylingContext.
  const clientSizesByCategory: Record<string, string> = {};
  for (const [bucket, size] of Object.entries(clientCtx?.sizesByCategory ?? {})) {
    if (size) clientSizesByCategory[bucket] = size;
  }
  const clientBudgetsByCategory: Record<string, [number, number]> = {};
  for (const [bucket, range] of Object.entries(
    clientCtx?.budgetsByCategory ?? {},
  )) {
    if (range) clientBudgetsByCategory[bucket] = range;
  }

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
      initialShopResponse={initialShop}
      shopFacets={facets}
      clientContextSummary={
        clientCtx ? toClientContextSummary(clientCtx) : null
      }
      closetItems={closetInventoryItems}
      cartItems={cartInventoryItems}
      purchasedItems={[]}
      inspirationItems={inspirationInventoryItems}
      previousMoodBoardItems={[]}
      previousStyleBoardItems={[]}
      storeItems={storeInventoryItems}
      clientProfile={clientProfile}
    />
  );
}
