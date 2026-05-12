// Sessionless styleboard creator for /stylist/profile/boards.
// Pre-creates a draft Board(STYLEBOARD, sessionId=null, isFeaturedOnProfile=false)
// for the signed-in stylist, then reuses the existing StyleboardBuilder in
// profileMode. Save publishes via POST /api/profile-boards/[id]/publish.

import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { getProduct, getFilters } from "@/lib/inventory/inventory-client";
import { loadShopInventory } from "@/lib/inventory/shop-inventory.service";
import { adaptProductDoc } from "@/lib/inventory/adapt-product-doc";
import { StyleboardBuilder } from "@/app/(stylist)/stylist/sessions/[id]/styleboards/new/builder";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ style?: string }>;
}

export default async function NewProfileStyleboardPage({ searchParams }: Props) {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) notFound();

  const profile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!profile) notFound();

  const styleFromQs = (await searchParams).style?.trim() || null;

  // Reuse an existing unfeatured draft for this stylist + style + STYLEBOARD
  // so double-clicks of +New board don't multiply drafts. Once published,
  // a fresh navigation spawns a new draft.
  let board = await prisma.board.findFirst({
    where: {
      type: "STYLEBOARD",
      sessionId: null,
      stylistProfileId: profile.id,
      isFeaturedOnProfile: false,
      profileStyle: styleFromQs,
    },
    include: { items: { orderBy: { orderIndex: "asc" } } },
  });
  if (!board) {
    const created = await prisma.board.create({
      data: {
        type: "STYLEBOARD",
        sessionId: null,
        stylistProfileId: profile.id,
        isFeaturedOnProfile: false,
        profileStyle: styleFromQs,
      },
    });
    board = { ...created, items: [] };
  }

  const directSaleRows = await prisma.merchandisedProduct.findMany({
    where: { isDirectSale: true },
    select: { inventoryProductId: true },
  });
  const directSaleProductIds = directSaleRows.map((r) => r.inventoryProductId);

  // Profile mode skips client context entirely: no closet, cart, dislikes,
  // sizes, budgets. Shop / Store / Inspiration are the only sources.
  const [inspiration, initialShop, facets, storeProductDocs] = await Promise.all(
    [
      listInspirationPhotos({ take: 60 }),
      loadShopInventory({ sessionId: null, page: 1, pageSize: 120 }),
      getFilters(),
      Promise.all(
        directSaleProductIds.slice(0, 60).map((id) => getProduct(id)),
      ),
    ],
  );

  const storeInventoryItems = storeProductDocs.flatMap((doc) =>
    doc ? [adaptProductDoc(doc)] : [],
  );
  const inspirationInventoryItems = inspiration.map((p) => ({
    id: p.id,
    image: p.url,
    brand: "Inspiration",
    name: p.title ?? "",
    category: "tops" as const,
  }));

  return (
    <StyleboardBuilder
      boardId={board.id}
      sessionId={null}
      isRevision={false}
      clientId=""
      clientName="your profile"
      clientAvatarUrl={null}
      clientLoyaltyTier={null}
      initialItems={board.items}
      clientSizesByCategory={{}}
      clientBudgetsByCategory={{}}
      directSaleProductIds={directSaleProductIds}
      initialShopResponse={initialShop}
      shopFacets={facets}
      clientContextSummary={null}
      closetItems={[]}
      cartItems={[]}
      purchasedItems={[]}
      inspirationItems={inspirationInventoryItems}
      previousMoodBoardItems={[]}
      previousStyleBoardItems={[]}
      storeItems={storeInventoryItems}
      profileMode
      initialProfileStyle={styleFromQs}
    />
  );
}
