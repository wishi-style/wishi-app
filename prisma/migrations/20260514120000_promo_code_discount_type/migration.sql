-- Promo codes: add discriminated discount type/value, drop amount_in_cents.
-- Existing rows are all dollar-amount codes (the only kind supported pre-port),
-- so they backfill cleanly to AMOUNT.

CREATE TYPE "PromoCodeDiscountType" AS ENUM ('AMOUNT', 'PERCENT');

ALTER TABLE "promo_codes"
  ADD COLUMN "discount_type"  "PromoCodeDiscountType",
  ADD COLUMN "discount_value" INTEGER;

UPDATE "promo_codes"
SET "discount_type" = 'AMOUNT',
    "discount_value" = "amount_in_cents";

ALTER TABLE "promo_codes"
  ALTER COLUMN "discount_type"  SET NOT NULL,
  ALTER COLUMN "discount_value" SET NOT NULL,
  DROP COLUMN "amount_in_cents";

-- Reject malformed rows at the DB level — AMOUNT must be a positive integer,
-- PERCENT must land in [1, 100]. Application layer also validates, but the
-- constraint prevents drift if a future caller bypasses the service.
ALTER TABLE "promo_codes"
  ADD CONSTRAINT "promo_codes_discount_value_valid_chk"
  CHECK (
    ("discount_type" = 'AMOUNT'  AND "discount_value" > 0) OR
    ("discount_type" = 'PERCENT' AND "discount_value" BETWEEN 1 AND 100)
  );
