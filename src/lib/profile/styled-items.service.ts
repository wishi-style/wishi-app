import { prisma } from "@/lib/prisma";

export interface StyledInventoryItem {
  inventoryProductId: string;
  sourceBoardId: string;
  sourceSessionId: string;
  sentAt: Date;
}

/**
 * Every inventory product the user has been styled with in a delivered
 * styleboard. Deduped by inventoryProductId — when the same product
 * appears on multiple boards, the most recent (by sentAt) wins the
 * attribution.
 *
 * Inventory product DTOs (image, title, brand, price, …) are resolved at
 * render time via the inventory client. This service only returns the
 * IDs + provenance so the rest of the pipeline stays decoupled from the
 * tastegraph wire shape.
 */
export async function listStyledInventoryItemsForUser(
  userId: string,
): Promise<StyledInventoryItem[]> {
  const rows = await prisma.boardItem.findMany({
    where: {
      inventoryProductId: { not: null },
      board: {
        type: "STYLEBOARD",
        sentAt: { not: null },
        session: { clientId: userId },
      },
    },
    select: {
      inventoryProductId: true,
      board: {
        select: {
          id: true,
          sessionId: true,
          sentAt: true,
        },
      },
    },
    orderBy: { board: { sentAt: "desc" } },
  });

  const byProduct = new Map<string, StyledInventoryItem>();
  for (const row of rows) {
    if (!row.inventoryProductId || !row.board?.sentAt || !row.board.sessionId) {
      continue;
    }
    if (byProduct.has(row.inventoryProductId)) continue;
    byProduct.set(row.inventoryProductId, {
      inventoryProductId: row.inventoryProductId,
      sourceBoardId: row.board.id,
      sourceSessionId: row.board.sessionId,
      sentAt: row.board.sentAt,
    });
  }
  return Array.from(byProduct.values());
}
