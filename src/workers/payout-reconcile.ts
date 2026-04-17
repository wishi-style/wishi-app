// Payout reconciliation worker. Runs weekly (Mondays 06:00 UTC). For every
// Payout row in PROCESSING that we haven't checked in the last 24h, pulls
// the current Stripe transfer state and flips the row accordingly.
//
// Stripe webhooks flip transfer.created → COMPLETED on our end already —
// this worker is a safety net for the cases where the webhook is lost or
// delayed. For FAILED transfers we rely on transfer.reversed.

import { prisma } from "@/lib/prisma";
import { retrieveTransfer } from "@/lib/stripe-connect";

export type ReconcileResult = {
  scanned: number;
  completed: number;
  failed: number;
  errors: number;
};

export async function runPayoutReconcile(): Promise<ReconcileResult> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const candidates = await prisma.payout.findMany({
    where: {
      status: "PROCESSING",
      stripeTransferId: { not: null },
      triggeredAt: { lte: twoDaysAgo },
      OR: [{ reconciledAt: null }, { reconciledAt: { lte: oneDayAgo } }],
    },
    select: { id: true, stripeTransferId: true },
    take: 200,
  });

  let completed = 0;
  let failed = 0;
  let errors = 0;

  for (const row of candidates) {
    if (!row.stripeTransferId) continue;
    try {
      const transfer = await retrieveTransfer(row.stripeTransferId);
      // A transfer with a non-null destination_payment and no reversals is
      // effectively paid through. If reversed is true, the row failed.
      const reversedAmount = transfer.amount_reversed ?? 0;
      if (reversedAmount > 0 && reversedAmount >= transfer.amount) {
        await prisma.payout.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            skippedReason: "stripe_transfer_reversed",
            reconciledAt: new Date(),
          },
        });
        failed += 1;
      } else if (transfer.destination_payment) {
        await prisma.payout.update({
          where: { id: row.id },
          data: { status: "COMPLETED", reconciledAt: new Date() },
        });
        completed += 1;
      } else {
        // Still pending — update reconciledAt so we skip for the next 24h
        // rather than refetching on every run.
        await prisma.payout.update({
          where: { id: row.id },
          data: { reconciledAt: new Date() },
        });
      }
    } catch (err) {
      console.error("[payout-reconcile] failed row", row.id, err);
      errors += 1;
    }
  }

  return { scanned: candidates.length, completed, failed, errors };
}
