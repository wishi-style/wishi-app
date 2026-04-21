import { prisma } from "@/lib/prisma";
import type { ClosetItem } from "@/generated/prisma/client";

/**
 * Materialize closet items from an Order's items. Idempotent: skips items
 * already linked via `ClosetItem.sourceOrderItemId`. Copies snapshotted
 * brand/title/image/size/color from each OrderItem so the closet entry is
 * self-contained even if the inventory service goes away later.
 */
export async function createClosetItemsFromOrder(
  orderId: string,
): Promise<ClosetItem[]> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  const existing = await prisma.closetItem.findMany({
    where: {
      userId: order.userId,
      sourceOrderItemId: { in: order.items.map((i) => i.id) },
    },
    select: { sourceOrderItemId: true },
  });
  const alreadyLinked = new Set(
    existing.map((e) => e.sourceOrderItemId).filter(Boolean) as string[],
  );

  const pending = order.items.filter((i) => !alreadyLinked.has(i.id));
  if (pending.length === 0) return [];

  const created: ClosetItem[] = [];
  for (const item of pending) {
    const closetItem = await prisma.closetItem.create({
      data: {
        userId: order.userId,
        s3Key: "", // snapshot image lives at item.imageUrl; S3 re-upload deferred
        url: item.imageUrl ?? "",
        name: item.title,
        designer: item.brand ?? null,
        category: null, // best-effort; stylist may tag later
        colors: item.color ? [item.color] : [],
        size: item.size ?? null,
        sourceOrderItemId: item.id,
      },
    });
    created.push(closetItem);
  }
  return created;
}
