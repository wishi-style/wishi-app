-- Phase 11: Verbatim port of Loveable's /style-quiz
-- Adds structured columns for every Loveable answer the stylist
-- dashboard or matching pipeline reads. comfort_zone_level stays for
-- one release cycle and is backfilled into the new comfort_zone enum.

-- ============================================================
-- New enums
-- ============================================================

CREATE TYPE "HeightCategory" AS ENUM ('TALL', 'AVERAGE', 'PETITE');

CREATE TYPE "ComfortZone" AS ENUM ('STAY_CLOSE', 'FEW_NEW_ITEMS', 'NEW_STYLE');

CREATE TYPE "TendToWear" AS ENUM ('MOSTLY_DRESSES', 'MOSTLY_PANTS', 'MIX');

CREATE TYPE "ShoppingReason" AS ENUM (
  'SPECIAL_EVENT',
  'WORKWEAR_UPDATE',
  'HOLIDAY',
  'STYLE_REFRESH',
  'PARTICULAR_PIECE'
);

CREATE TYPE "WorkEnvironment" AS ENUM ('CORPORATE', 'DENIM_FRIENDLY', 'ANYTHING_GOES', 'OTHER');

CREATE TYPE "HearAboutSource" AS ENUM (
  'INSTAGRAM',
  'REFERRED_BY_STYLIST',
  'FRIEND_FAMILY',
  'INTERNET_SEARCH',
  'ARTICLE_MEDIA',
  'PINTEREST',
  'FACEBOOK',
  'NEWSLETTER',
  'REPEAT_CUSTOMER',
  'OTHER'
);

-- ============================================================
-- Expand FitPreference with Loveable's five values
-- Legacy SLIM / REGULAR / RELAXED stay for back-compat reads;
-- new submissions only write TIGHT / FITTED / STRAIGHT / LOOSE / OVERSIZED.
-- ============================================================

ALTER TYPE "FitPreference" ADD VALUE IF NOT EXISTS 'TIGHT';
ALTER TYPE "FitPreference" ADD VALUE IF NOT EXISTS 'FITTED';
ALTER TYPE "FitPreference" ADD VALUE IF NOT EXISTS 'STRAIGHT';
ALTER TYPE "FitPreference" ADD VALUE IF NOT EXISTS 'LOOSE';

-- ============================================================
-- style_profiles: new structured columns
-- ============================================================

ALTER TABLE "style_profiles"
  ADD COLUMN "comfort_zone"            "ComfortZone",
  ADD COLUMN "shopping_reason"         "ShoppingReason",
  ADD COLUMN "work_environment"        "WorkEnvironment",
  ADD COLUMN "work_environment_other"  TEXT,
  ADD COLUMN "wear_location"           TEXT,
  ADD COLUMN "tend_to_wear"            "TendToWear",
  ADD COLUMN "hear_about_source"       "HearAboutSource",
  ADD COLUMN "hear_about_source_other" TEXT;

-- Backfill comfort_zone from existing comfort_zone_level using the same
-- buckets that client-profile.ts:comfortZoneLabel already uses.
UPDATE "style_profiles"
SET "comfort_zone" = CASE
  WHEN "comfort_zone_level" BETWEEN 1 AND 3 THEN 'STAY_CLOSE'::"ComfortZone"
  WHEN "comfort_zone_level" BETWEEN 4 AND 7 THEN 'FEW_NEW_ITEMS'::"ComfortZone"
  WHEN "comfort_zone_level" BETWEEN 8 AND 10 THEN 'NEW_STYLE'::"ComfortZone"
  ELSE NULL
END
WHERE "comfort_zone_level" IS NOT NULL;

-- ============================================================
-- body_profiles: new columns
-- ============================================================

ALTER TABLE "body_profiles"
  ADD COLUMN "body_areas_notes" TEXT,
  ADD COLUMN "height_category"  "HeightCategory",
  ADD COLUMN "body_photo_url"   TEXT;

-- ============================================================
-- body_sizes: relax unique so per-category multi-select is allowed
-- ============================================================

-- DROP IF EXISTS — some environments diverged from the Prisma schema and
-- never had the (body_profile_id, category) unique. Don't fail on absence.
ALTER TABLE "body_sizes" DROP CONSTRAINT IF EXISTS "body_sizes_body_profile_id_category_key";

ALTER TABLE "body_sizes"
  ADD CONSTRAINT "body_sizes_body_profile_id_category_size_key"
  UNIQUE ("body_profile_id", "category", "size");
