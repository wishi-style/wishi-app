-- Split the commission amount off of `total_in_cents` and persist the
-- affiliate network's order reference that `upgradeToConfirmed` was
-- previously dropping.
ALTER TABLE "orders"
  ADD COLUMN "commission_in_cents" INTEGER,
  ADD COLUMN "order_reference" TEXT;

CREATE INDEX "orders_order_reference_idx" ON "orders"("order_reference");
