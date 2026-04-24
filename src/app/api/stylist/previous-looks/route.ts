import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Returns flattened BoardItems from the stylist's past sent styleboards.
// Scope can be narrowed to a single client via ?clientId= (the current
// session's client, so the "This client" toggle in LookCreator shows
// continuity). Each row carries an image url + label so the LookCreator
// can render it without a second round-trip.

interface PreviousLookItem {
  id: string;
  boardId: string;
  boardTitle: string | null;
  boardSentAt: string;
  source: string;
  inventoryProductId: string | null;
  closetItemId: string | null;
  inspirationPhotoId: string | null;
  webItemUrl: string | null;
  imageUrl: string | null;
  label: string | null;
  brand: string | null;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "STYLIST" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 60), 200);

  const stylistProfile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!stylistProfile) return NextResponse.json({ items: [] });

  const boards = await prisma.board.findMany({
    where: {
      stylistProfileId: stylistProfile.id,
      type: "STYLEBOARD",
      sentAt: { not: null },
      ...(clientId
        ? {
            session: { clientId },
          }
        : {}),
    },
    orderBy: { sentAt: "desc" },
    take: 20, // bound boards so we don't pull thousands of items
    include: {
      items: {
        orderBy: { orderIndex: "asc" },
        include: {
          closetItem: { select: { url: true, name: true, designer: true } },
          inspirationPhoto: { select: { url: true, title: true } },
        },
      },
    },
  });

  const items: PreviousLookItem[] = [];
  for (const b of boards) {
    for (const it of b.items) {
      let imageUrl: string | null = null;
      let label: string | null = null;
      let brand: string | null = null;
      if (it.source === "CLOSET") {
        imageUrl = it.closetItem?.url ?? null;
        label = it.closetItem?.name ?? null;
        brand = it.closetItem?.designer ?? null;
      } else if (it.source === "INSPIRATION_PHOTO") {
        imageUrl = it.inspirationPhoto?.url ?? null;
        label = it.inspirationPhoto?.title ?? null;
      } else if (it.source === "WEB_ADDED") {
        imageUrl = it.webItemImageUrl ?? null;
        label = it.webItemTitle ?? it.webItemUrl;
        brand = it.webItemBrand;
      } else if (it.source === "INVENTORY") {
        label = it.inventoryProductId;
      }
      items.push({
        id: it.id,
        boardId: b.id,
        boardTitle: b.title,
        boardSentAt: b.sentAt!.toISOString(),
        source: it.source,
        inventoryProductId: it.inventoryProductId,
        closetItemId: it.closetItemId,
        inspirationPhotoId: it.inspirationPhotoId,
        webItemUrl: it.webItemUrl,
        imageUrl,
        label,
        brand,
      });
      if (items.length >= limit) break;
    }
    if (items.length >= limit) break;
  }

  return NextResponse.json({ items });
}
