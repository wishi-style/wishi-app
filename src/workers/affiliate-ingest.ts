/**
 * Daily 05:00 UTC. Polls the tastegraph /internal/commissions endpoint,
 * matches events to AffiliateClick rows, upgrades or creates Orders.
 *
 * Three dedup branches per commission event:
 *   (a) matched click has AFFILIATE_CONFIRMED order → skip
 *   (b) matched click has SELF_REPORTED order      → upgrade in place
 *   (c) no match or matched click has no order     → create new order
 */
import { iterateCommissions } from "@/lib/inventory/inventory-client";
import {
  findCandidateClicks,
  linkOrder,
} from "@/lib/affiliate/click-service";
import {
  createOrder,
  upgradeToConfirmed,
} from "@/lib/orders/order-service";
import { prisma } from "@/lib/prisma";
import type { CommissionEvent } from "@/lib/inventory/types";

interface IngestSummary extends Record<string, unknown> {
  processed: number;
  skipped: number;
  upgraded: number;
  created: number;
  errored: number;
}

export async function runAffiliateIngest(
  since?: Date,
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    processed: 0,
    skipped: 0,
    upgraded: 0,
    created: 0,
    errored: 0,
  };

  for await (const batch of iterateCommissions(since)) {
    for (const event of batch) {
      summary.processed += 1;
      try {
        const action = await reconcileCommission(event);
        if (action === "skip") summary.skipped += 1;
        if (action === "upgrade") summary.upgraded += 1;
        if (action === "create") summary.created += 1;
      } catch (err) {
        summary.errored += 1;
        console.warn(`[affiliate-ingest] failed event ${event.listing_id}:`, err);
      }
    }
  }
  return summary;
}

type Action = "skip" | "upgrade" | "create";

async function reconcileCommission(event: CommissionEvent): Promise<Action> {
  const orderPlacedAt = new Date(event.order_placed_at);
  const candidates = await findCandidateClicks(
    event.product_id,
    event.merchant_name,
    orderPlacedAt,
  );

  // (a) — a candidate click already has a confirmed order: already reconciled.
  const confirmed = candidates.find(
    (c) => c.order?.source === "AFFILIATE_CONFIRMED",
  );
  if (confirmed) return "skip";

  // (b) — a candidate click has a SELF_REPORTED order we can upgrade.
  const selfReported = candidates.find(
    (c) => c.order?.source === "SELF_REPORTED",
  );
  if (selfReported?.orderId) {
    await upgradeToConfirmed(selfReported.orderId, {
      commissionInCents: event.commission_in_cents,
      orderReference: event.order_reference,
    });
    return "upgrade";
  }

  // (c) — create a fresh AFFILIATE_CONFIRMED order and link the latest click.
  // Prefer the most-recent click (candidates sorted desc by clickedAt).
  const click = candidates[0];
  if (!click) return "skip"; // truly orphan commission — log but don't block.

  const order = await createOrder({
    userId: click.userId,
    sessionId: click.sessionId ?? undefined,
    source: "AFFILIATE_CONFIRMED",
    retailer: event.merchant_name,
    totalInCents: event.amount_in_cents,
    items: [
      {
        inventoryProductId: event.product_id,
        inventoryListingId: event.listing_id,
        title: await lookupTitle(event),
        priceInCents: event.amount_in_cents,
      },
    ],
  });
  await linkOrder(click.id, order.id);
  return "create";
}

/**
 * Best-effort: the commission event doesn't carry the product title.
 * If we previously hydrated the inventory product, reuse it.
 */
async function lookupTitle(event: CommissionEvent): Promise<string> {
  const prior = await prisma.orderItem.findFirst({
    where: { inventoryProductId: event.product_id },
    orderBy: { createdAt: "desc" },
    select: { title: true },
  });
  return prior?.title ?? `Order #${event.order_reference}`;
}
