import { prisma } from "@/lib/prisma";
import type { CartItem } from "@/generated/prisma/client";

export interface AddCartItemInput {
  userId: string;
  inventoryProductId: string;
  sessionId: string;
  quantity?: number;
}

/**
 * Cart items are session-scoped: every entry carries the session it was added
 * from so the StylingRoom Cart tab can filter to that session's products.
 * Universal cart — any inventory product the stylist surfaces is addable;
 * fulfillment for non-merchandised SKUs is handled out-of-band by ops.
 * The deferred order-system phase (see WISHI-LAUNCH-PREP B9) replaces that
 * manual leg with sourcing automation. The `[userId, inventoryProductId,
 * sessionId]` unique upgrades quantity rather than creating duplicates.
 */
export async function addCartItem(
  input: AddCartItemInput,
): Promise<CartItem> {
  const qty = input.quantity ?? 1;
  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error("quantity must be a positive integer");
  }

  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { id: true, clientId: true, status: true },
  });
  if (!session || session.clientId !== input.userId) {
    throw new Error("Session not found");
  }
  if (session.status === "COMPLETED" || session.status === "CANCELLED") {
    throw new Error("Cannot add to cart on a completed or cancelled session");
  }

  return prisma.cartItem.upsert({
    where: {
      userId_inventoryProductId_sessionId: {
        userId: input.userId,
        inventoryProductId: input.inventoryProductId,
        sessionId: input.sessionId,
      },
    },
    update: { quantity: { increment: qty } },
    create: {
      userId: input.userId,
      inventoryProductId: input.inventoryProductId,
      sessionId: input.sessionId,
      quantity: qty,
    },
  });
}

export async function removeCartItem(
  userId: string,
  cartItemId: string,
): Promise<void> {
  const item = await prisma.cartItem.findUnique({
    where: { id: cartItemId },
    select: { userId: true },
  });
  if (!item || item.userId !== userId) return;
  await prisma.cartItem.delete({ where: { id: cartItemId } });
}

export async function listCartItems(
  userId: string,
  sessionId?: string,
): Promise<CartItem[]> {
  return prisma.cartItem.findMany({
    where: { userId, ...(sessionId ? { sessionId } : {}) },
    orderBy: { addedAt: "desc" },
  });
}

export async function getCartItemsByIds(
  userId: string,
  cartItemIds: string[],
): Promise<CartItem[]> {
  if (cartItemIds.length === 0) return [];
  return prisma.cartItem.findMany({
    where: { id: { in: cartItemIds }, userId },
  });
}
