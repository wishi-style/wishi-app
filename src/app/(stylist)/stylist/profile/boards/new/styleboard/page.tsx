// Sessionless styleboard creator for /stylist/profile/boards.
// Pre-creates a draft Board(STYLEBOARD, sessionId=null, isFeaturedOnProfile=false)
// for the signed-in stylist, then reuses the existing StyleboardBuilder in
// profileMode. Save publishes via POST /api/profile-boards/[id]/publish.

import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { getFilters } from "@/lib/inventory/inventory-client";
import { loadShopInventory } from "@/lib/inventory/shop-inventory.service";
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

  // Universal Unicart: every inventory item is Wishi-shoppable; the legacy
  // direct-sale allow-list is gone. The Shop tab covers the full catalog.
  const directSaleProductIds: string[] = [];

  // Profile mode skips client context entirely: no closet, cart, dislikes,
  // sizes, budgets. Shop + Inspiration are the only sources.
  const [inspiration, initialShop, facets] = await Promise.all([
    listInspirationPhotos({ take: 60 }),
    loadShopInventory({ sessionId: null, page: 1, pageSize: 120 }),
    getFilters(),
  ]);

  const storeInventoryItems: never[] = [];
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
      // Empty-but-shaped client context so the Shop tab's full filter rail
      // (Brand / Category / Color / Size / Price / Fabric / etc.) renders
      // in profile mode. The rail gates client-specific prose on
      // `clientFirstName` being truthy, so an empty name suppresses the
      // "Tuned for <client>" and "Reset to <client>'s profile" bits.
      clientContextSummary={{
        clientFirstName: "",
        inventoryGender: undefined,
        sizesByCategory: {},
        budgetsByCategory: {},
        likedColorKeys: [],
        preferredBrandNames: [],
        excludeLeatherByDefault: false,
      }}
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
