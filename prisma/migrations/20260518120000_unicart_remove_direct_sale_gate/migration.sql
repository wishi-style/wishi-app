-- Unicart: remove the direct-sale allow-list gate (every inventory item with
-- a retailer link is Wishi-shoppable) and add per-OrderItem fulfillment state.
--
-- This migration is additive on order_items (new nullable columns + a
-- defaulted enum) and destructive on merchandised_products (the table is
-- dropped). All gating logic on isDirectSale has already been removed from
-- the application code prior to this migration applying.

-- ─── 1. New per-OrderItem state enum ─────────────────────────────────────
CREATE TYPE "OrderItemStatus" AS ENUM (
  'PENDING',
  'PURCHASED',
  'UNFULFILLABLE',
  'RETURN_REQUESTED',
  'RETURNED'
);

-- ─── 2. New roll-up terminal for whole-order state ───────────────────────
-- The legacy SHIPPED/ARRIVED/RETURN_IN_PROCESS/RETURNED states stay valid so
-- in-flight Phase 11 orders keep transitioning. New universal-fulfillment
-- orders go ORDERED → COMPLETED once every OrderItem resolves.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- ─── 3. Per-OrderItem fulfillment columns ────────────────────────────────
ALTER TABLE "order_items"
  ADD COLUMN "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "retailer_name" TEXT,
  ADD COLUMN "retailer_order_ref" TEXT,
  ADD COLUMN "unfulfillable_reason" TEXT,
  ADD COLUMN "unfulfillable_notes" TEXT,
  ADD COLUMN "refunded_in_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "refunded_at" TIMESTAMP(3),
  ADD COLUMN "return_requested_at" TIMESTAMP(3),
  ADD COLUMN "return_receipt_ref" TEXT;

CREATE INDEX "order_items_status_idx" ON "order_items"("status");

-- ─── 4. Backfill existing OrderItems based on the parent Order's status ──
-- Items inside orders that already reached ARRIVED are de-facto PURCHASED
-- (the human fulfiller bought them, they shipped, they arrived). Items
-- inside orders in RETURN_IN_PROCESS / RETURNED inherit the matching item-
-- level state. Everything else stays PENDING.
UPDATE "order_items"
SET "status" = 'PURCHASED'
FROM "orders"
WHERE "order_items"."order_id" = "orders"."id"
  AND "orders"."status" IN ('SHIPPED', 'ARRIVED');

UPDATE "order_items"
SET "status" = 'RETURN_REQUESTED', "return_requested_at" = COALESCE("orders"."return_initiated_at", NOW())
FROM "orders"
WHERE "order_items"."order_id" = "orders"."id"
  AND "orders"."status" = 'RETURN_IN_PROCESS';

UPDATE "order_items"
SET "status" = 'RETURNED', "refunded_at" = "orders"."refunded_at"
FROM "orders"
WHERE "order_items"."order_id" = "orders"."id"
  AND "orders"."status" = 'RETURNED';

-- ─── 5. Snapshot retailer names from the parent Order's `retailer` column ─
-- The Order had a single `retailer` field; new OrderItems will snapshot per
-- item from the inventory listing at checkout time. Existing items inherit
-- their parent order's retailer as a sensible default for the admin view.
UPDATE "order_items"
SET "retailer_name" = "orders"."retailer"
FROM "orders"
WHERE "order_items"."order_id" = "orders"."id"
  AND "order_items"."retailer_name" IS NULL;

-- ─── 6. Drop the direct-sale allow-list gate ─────────────────────────────
DROP TABLE IF EXISTS "merchandised_products";
