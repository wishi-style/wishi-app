import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { listClosetItems } from "@/lib/boards/closet.service";
import { mapLoyalty } from "@/lib/stylists/client-profile";
import { getProduct } from "@/lib/inventory/inventory-client";
import { StyleboardBuilder, type CartItemView } from "./builder";

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

  const [closetItems, inspiration, cartRows] = await Promise.all([
    listClosetItems({ userId: session.clientId }),
    listInspirationPhotos({ take: 60 }),
    prisma.cartItem.findMany({
      where: { userId: session.clientId, sessionId },
      orderBy: { addedAt: "desc" },
      select: { id: true, inventoryProductId: true, quantity: true },
    }),
  ]);

  // Loveable surfaces the client's in-progress cart as a sub-tab in the
  // closet panel. Hydrate via tastegraph in the same request so the builder
  // doesn't need a second round-trip.
  const cartProductDocs = await Promise.all(
    cartRows.map((c) => getProduct(c.inventoryProductId)),
  );
  const cartItems: CartItemView[] = cartRows.flatMap((c, i) => {
    const doc = cartProductDocs[i];
    if (!doc) return [];
    return [
      {
        id: c.id,
        inventoryProductId: c.inventoryProductId,
        imageUrl: doc.primary_image_url ?? doc.image_urls?.[0] ?? null,
        name: doc.canonical_name,
        brand: doc.brand_name,
        priceCents: Math.round(doc.min_price * 100),
      },
    ];
  });

  const clientName =
    [session.client.firstName, session.client.lastName]
      .filter(Boolean)
      .join(" ") || "Client";

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
      closetItems={closetItems}
      cartItems={cartItems}
      inspiration={inspiration}
    />
  );
}
