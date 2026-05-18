import { prisma } from "@/lib/prisma";
import type { ClosetItem, OrderItem } from "@/generated/prisma/client";

/**
 * Materialize a closet item from a single OrderItem snapshot. Idempotent:
 * if a ClosetItem already links to this `OrderItem.id` via
 * `sourceOrderItemId`, returns it unchanged. Copies snapshotted
 * brand/title/image/size/color from the OrderItem so the closet entry is
 * self-contained even if the inventory service goes away later.
 *
 * Used by the per-OrderItem `PURCHASED` transition (universal-fulfillment
 * flow) AND by the legacy whole-order `ARRIVED` transition path.
 */
export async function createClosetItemForOrderItem(
  orderItem: Pick<
    OrderItem,
    "id" | "title" | "brand" | "imageUrl" | "color" | "size"
  > & { userId: string },
): Promise<ClosetItem> {
  const existing = await prisma.closetItem.findFirst({
    where: {
      userId: orderItem.userId,
      sourceOrderItemId: orderItem.id,
    },
  });
  if (existing) return existing;

  return prisma.closetItem.create({
    data: {
      userId: orderItem.userId,
      s3Key: "", // snapshot image lives at item.imageUrl; S3 re-upload deferred
      url: orderItem.imageUrl ?? "",
      name: orderItem.title,
      designer: orderItem.brand ?? null,
      category: null, // best-effort; stylist may tag later
      colors: orderItem.color ? [orderItem.color] : [],
      size: orderItem.size ?? null,
      sourceOrderItemId: orderItem.id,
    },
  });
}

/**
 * Materialize closet items from every item on an Order. Idempotent per
 * OrderItem via `createClosetItemForOrderItem`. Kept around for the legacy
 * `Order.status = ARRIVED` transition path; the per-OrderItem flow calls
 * `createClosetItemForOrderItem` directly on each PURCHASED transition.
 */
export async function createClosetItemsFromOrder(
  orderId: string,
): Promise<ClosetItem[]> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new Error(`Order ${orderId} not found`);

  const created: ClosetItem[] = [];
  for (const item of order.items) {
    const closetItem = await createClosetItemForOrderItem({
      ...item,
      userId: order.userId,
    });
    created.push(closetItem);
  }
  return created;
}
