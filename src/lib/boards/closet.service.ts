import { prisma } from "@/lib/prisma";
import type { ClosetItem } from "@/generated/prisma/client";

// Orders/Closet split invariant: only `closet/auto-create.ts` (delivery hook)
// or admin tooling may set `ClosetItem.sourceOrderItemId`. The manual upload
// path here MUST NOT accept it — listing it on this input would let a client
// claim a closet item came from an order it didn't.
export interface CreateClosetItemInput {
  userId: string;
  s3Key: string;
  url: string;
  name?: string;
  designer?: string;
  season?: string;
  category?: string;
  colors?: string[];
  size?: string;
  material?: string;
}

export async function createClosetItem(
  input: CreateClosetItemInput,
): Promise<ClosetItem> {
  return prisma.closetItem.create({
    data: {
      userId: input.userId,
      s3Key: input.s3Key,
      url: input.url,
      name: input.name ?? null,
      designer: input.designer ?? null,
      season: input.season ?? null,
      category: input.category ?? null,
      colors: input.colors ?? [],
      size: input.size ?? null,
      material: input.material ?? null,
    },
  });
}

export interface ListClosetQuery {
  userId: string;
  category?: string;
  designer?: string;
  color?: string;
  season?: string;
}

export async function listClosetItems(
  query: ListClosetQuery,
): Promise<ClosetItem[]> {
  return prisma.closetItem.findMany({
    where: {
      userId: query.userId,
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.designer ? { designer: query.designer } : {}),
      ...(query.color ? { colors: { has: query.color } } : {}),
      ...(query.season ? { season: query.season } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClosetItem(
  userId: string,
  id: string,
): Promise<ClosetItem | null> {
  return prisma.closetItem.findFirst({
    where: { id, userId, deletedAt: null },
  });
}

export async function softDeleteClosetItem(userId: string, id: string): Promise<void> {
  await prisma.closetItem.updateMany({
    where: { id, userId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}
