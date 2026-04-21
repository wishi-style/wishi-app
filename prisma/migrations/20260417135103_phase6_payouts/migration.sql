-- Phase 6: Payouts & Stylist Onboarding infrastructure
--
-- Adds two nullable-defaulted columns:
--   stylist_profiles.payouts_enabled (Boolean) — flipped true by Stripe `account.updated`
--     webhook when the Express account has charges_enabled && payouts_enabled.
--     Payout dispatch gates on this to avoid shipping transfers before Stripe is ready.
--   payouts.reconciled_at (TIMESTAMP?) — set when a payout reaches a terminal
--     state. Written by the Stripe transfer webhooks (transfer.created /
--     transfer.failed) on live delivery and by the weekly payout-reconcile
--     worker (Phase 6b) as a backstop so subsequent sweeps can skip
--     already-scanned rows.

ALTER TABLE "stylist_profiles"
  ADD COLUMN "payouts_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payouts"
  ADD COLUMN "reconciled_at" TIMESTAMP(3);
