import { prisma } from "@/lib/prisma";
import type { InspirationPhoto } from "@/generated/prisma/client";

export interface CreateInspirationInput {
  s3Key: string;
  url: string;
  title?: string;
  category?: string;
  tags?: string[];
  createdBy?: string;
}

export async function createInspirationPhoto(
  input: CreateInspirationInput,
): Promise<InspirationPhoto> {
  return prisma.inspirationPhoto.create({
    data: {
      s3Key: input.s3Key,
      url: input.url,
      title: input.title ?? null,
      category: input.category ?? null,
      tags: input.tags ?? [],
      createdBy: input.createdBy ?? null,
    },
  });
}

export interface ListInspirationQuery {
  category?: string;
  search?: string;
  take?: number;
  skip?: number;
}

export async function listInspirationPhotos(
  query: ListInspirationQuery = {},
): Promise<InspirationPhoto[]> {
  return prisma.inspirationPhoto.findMany({
    where: {
      deletedAt: null,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { tags: { hasSome: [query.search] } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: query.take ?? 60,
    skip: query.skip ?? 0,
  });
}

export async function softDeleteInspirationPhoto(id: string): Promise<void> {
  await prisma.inspirationPhoto.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
