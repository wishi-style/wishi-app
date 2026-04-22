import { prisma } from "@/lib/prisma";
import { DomainError, NotFoundError } from "@/lib/errors/domain-error";
import type { Collection, CollectionItem } from "@/generated/prisma/client";

export const COLLECTION_NAME_MAX = 80;

export interface CollectionWithPreview {
  id: string;
  name: string;
  coverImageUrl: string | null;
  itemCount: number;
  previewImages: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Validate + normalize a collection name. Pure function so it's unit-testable
 * without a database. Returns the trimmed name on success.
 */
export function validateCollectionName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new DomainError("Name required");
  if (trimmed.length > COLLECTION_NAME_MAX) {
    throw new DomainError(
      `Name must be ≤ ${COLLECTION_NAME_MAX} characters`,
    );
  }
  return trimmed;
}

export async function createCollection(
  userId: string,
  name: string,
  closetItemIds: string[] = [],
): Promise<Collection> {
  const cleanName = validateCollectionName(name);

  return prisma.$transaction(async (tx) => {
    const collection = await tx.collection.create({
      data: { userId, name: cleanName },
    });

    if (closetItemIds.length > 0) {
      // Re-check ownership of the items to be added so a malicious caller
      // can't seed a fresh collection with someone else's closet rows.
      const owned = await tx.closetItem.findMany({
        where: { id: { in: closetItemIds }, userId, deletedAt: null },
        select: { id: true },
      });
      if (owned.length > 0) {
        await tx.collectionItem.createMany({
          data: owned.map((row, i) => ({
            collectionId: collection.id,
            closetItemId: row.id,
            sortOrder: i,
          })),
        });
      }
    }

    return collection;
  });
}

export async function listCollections(
  userId: string,
): Promise<CollectionWithPreview[]> {
  const rows = await prisma.collection.findMany({
    where: { userId },
    include: {
      items: {
        include: { closetItem: { select: { url: true } } },
        orderBy: { sortOrder: "asc" },
        take: 4,
      },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    coverImageUrl: c.coverImageUrl,
    itemCount: c._count.items,
    previewImages: c.items
      .map((it) => it.closetItem.url)
      .filter((u): u is string => Boolean(u)),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
}

export interface CollectionDetail {
  id: string;
  name: string;
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    sortOrder: number;
    addedAt: Date;
    closetItem: {
      id: string;
      url: string;
      name: string | null;
      designer: string | null;
      category: string | null;
    };
  }>;
}

export async function getCollection(
  userId: string,
  id: string,
): Promise<CollectionDetail> {
  const collection = await prisma.collection.findFirst({
    where: { id, userId },
    include: {
      items: {
        include: {
          closetItem: {
            select: {
              id: true,
              url: true,
              name: true,
              designer: true,
              category: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!collection) throw new NotFoundError("Collection not found");

  return {
    id: collection.id,
    name: collection.name,
    coverImageUrl: collection.coverImageUrl,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    items: collection.items,
  };
}

export interface UpdateCollectionInput {
  name?: string;
  coverImageUrl?: string | null;
}

export async function updateCollection(
  userId: string,
  id: string,
  input: UpdateCollectionInput,
): Promise<Collection> {
  const existing = await prisma.collection.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) throw new NotFoundError("Collection not found");

  const data: { name?: string; coverImageUrl?: string | null } = {};
  if (input.name !== undefined) data.name = validateCollectionName(input.name);
  if (input.coverImageUrl !== undefined) data.coverImageUrl = input.coverImageUrl;

  return prisma.collection.update({ where: { id }, data });
}

export async function deleteCollection(userId: string, id: string): Promise<void> {
  const result = await prisma.collection.deleteMany({
    where: { id, userId },
  });
  if (result.count === 0) throw new NotFoundError("Collection not found");
}

export async function addItemsToCollection(
  userId: string,
  collectionId: string,
  closetItemIds: string[],
): Promise<{ added: CollectionItem[]; skipped: string[] }> {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  if (!collection) throw new NotFoundError("Collection not found");

  // Filter to items the user actually owns.
  const owned = await prisma.closetItem.findMany({
    where: { id: { in: closetItemIds }, userId, deletedAt: null },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));
  const skipped = closetItemIds.filter((id) => !ownedIds.has(id));

  if (owned.length === 0) return { added: [], skipped };

  // Find the current max sortOrder so new items append. Existing pairs are
  // skipped silently (DB unique enforces idempotency).
  const last = await prisma.collectionItem.findFirst({
    where: { collectionId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const baseSort = (last?.sortOrder ?? -1) + 1;

  const existingPairs = await prisma.collectionItem.findMany({
    where: { collectionId, closetItemId: { in: [...ownedIds] } },
    select: { closetItemId: true },
  });
  const existingSet = new Set(existingPairs.map((p) => p.closetItemId));
  const toCreate = [...ownedIds].filter((id) => !existingSet.has(id));

  if (toCreate.length === 0) return { added: [], skipped };

  await prisma.collectionItem.createMany({
    data: toCreate.map((closetItemId, i) => ({
      collectionId,
      closetItemId,
      sortOrder: baseSort + i,
    })),
    skipDuplicates: true,
  });

  const added = await prisma.collectionItem.findMany({
    where: { collectionId, closetItemId: { in: toCreate } },
  });
  return { added, skipped };
}

export async function removeItemFromCollection(
  userId: string,
  collectionId: string,
  closetItemId: string,
): Promise<void> {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, userId },
    select: { id: true },
  });
  if (!collection) throw new NotFoundError("Collection not found");

  await prisma.collectionItem.deleteMany({
    where: { collectionId, closetItemId },
  });
}
