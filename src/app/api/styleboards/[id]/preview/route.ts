import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProduct } from "@/lib/inventory/inventory-client";

export const dynamic = "force-dynamic";

/**
 * Returns up to N resolved item thumbnail URLs for a sent styleboard so the
 * chat-side `<StyleBoardMessage>` can render the columns-2 mosaic without
 * round-tripping per-item product fetches from the client.
 *
 * Authorization mirrors the parent GET: client + stylist on the session, or
 * admin.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const board = await prisma.board.findUnique({
    where: { id },
    include: {
      session: { select: { clientId: true, stylistId: true } },
      items: {
        orderBy: { orderIndex: "asc" },
        take: 6,
        include: {
          closetItem: { select: { url: true } },
          inspirationPhoto: { select: { url: true } },
        },
      },
    },
  });

  if (!board || board.type !== "STYLEBOARD") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    !board.session ||
    (board.session.clientId !== user.id &&
      board.session.stylistId !== user.id &&
      !user.isAdmin)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const thumbnails = await Promise.all(
    board.items.map(async (item) => {
      switch (item.source) {
        case "INVENTORY":
          if (!item.inventoryProductId) return null;
          return getProduct(item.inventoryProductId)
            .then((p) => p?.primary_image_url ?? null)
            .catch(() => null);
        case "CLOSET":
          return item.closetItem?.url ?? null;
        case "INSPIRATION_PHOTO":
          return item.inspirationPhoto?.url ?? null;
        case "WEB_ADDED":
          return item.webItemImageUrl ?? null;
        default:
          return null;
      }
    }),
  );

  return NextResponse.json({
    thumbnails: thumbnails.filter((u): u is string => Boolean(u)),
  });
}
