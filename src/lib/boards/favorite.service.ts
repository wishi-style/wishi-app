import { prisma } from "@/lib/prisma";
import type { FavoriteBoard, FavoriteItem } from "@/generated/prisma/client";

export interface FavoriteItemInput {
  userId: string;
  inventoryProductId?: string;
  webUrl?: string;
  webItemTitle?: string;
  webItemBrand?: string;
  webItemImageUrl?: string;
  webItemPriceInCents?: number;
}

export async function favoriteItem(input: FavoriteItemInput): Promise<FavoriteItem> {
  if (!input.inventoryProductId && !input.webUrl) {
    throw new Error("favoriteItem requires inventoryProductId or webUrl");
  }
  const existing = await prisma.favoriteItem.findFirst({
    where: {
      userId: input.userId,
      ...(input.inventoryProductId
        ? { inventoryProductId: input.inventoryProductId }
        : { webUrl: input.webUrl }),
    },
  });
  if (existing) return existing;
  return prisma.favoriteItem.create({
    data: {
      userId: input.userId,
      inventoryProductId: input.inventoryProductId ?? null,
      webUrl: input.webUrl ?? null,
      webItemTitle: input.webItemTitle ?? null,
      webItemBrand: input.webItemBrand ?? null,
      webItemImageUrl: input.webItemImageUrl ?? null,
      webItemPriceInCents: input.webItemPriceInCents ?? null,
    },
  });
}

export async function unfavoriteItem(input: {
  userId: string;
  inventoryProductId?: string;
  webUrl?: string;
}): Promise<number> {
  const result = await prisma.favoriteItem.deleteMany({
    where: {
      userId: input.userId,
      ...(input.inventoryProductId
        ? { inventoryProductId: input.inventoryProductId }
        : { webUrl: input.webUrl }),
    },
  });
  return result.count;
}

export async function listFavoriteItems(userId: string): Promise<FavoriteItem[]> {
  return prisma.favoriteItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function favoriteBoard(
  userId: string,
  boardId: string,
): Promise<FavoriteBoard> {
  return prisma.favoriteBoard.upsert({
    where: { userId_boardId: { userId, boardId } },
    create: { userId, boardId },
    update: {},
  });
}

export async function unfavoriteBoard(userId: string, boardId: string): Promise<void> {
  await prisma.favoriteBoard.deleteMany({ where: { userId, boardId } });
}

export async function listFavoriteBoards(userId: string) {
  return prisma.favoriteBoard.findMany({
    where: { userId },
    include: { board: true },
    orderBy: { createdAt: "desc" },
  });
}
