-- Phase 4 constraints: append to the generated phase4_boards migration or run
-- immediately after `npx prisma migrate dev --name phase4_boards` on any
-- environment where the migration was applied without this raw SQL.
--
-- Verifies:
--   \d board_items  → expect board_item_source_check CHECK constraint
--   \di favorite_items_user_product_uniq_idx → expect partial unique index

-- 1) Polymorphic BoardItem: enforce exactly one source field is populated
ALTER TABLE "board_items"
  ADD CONSTRAINT board_item_source_check CHECK (
    (source = 'INVENTORY'
      AND "inventory_product_id" IS NOT NULL
      AND "closet_item_id" IS NULL
      AND "inspiration_photo_id" IS NULL
      AND "web_item_url" IS NULL)
    OR (source = 'CLOSET'
      AND "closet_item_id" IS NOT NULL
      AND "inventory_product_id" IS NULL
      AND "inspiration_photo_id" IS NULL
      AND "web_item_url" IS NULL)
    OR (source = 'INSPIRATION_PHOTO'
      AND "inspiration_photo_id" IS NOT NULL
      AND "inventory_product_id" IS NULL
      AND "closet_item_id" IS NULL
      AND "web_item_url" IS NULL)
    OR (source = 'WEB_ADDED'
      AND "web_item_url" IS NOT NULL
      AND "inventory_product_id" IS NULL
      AND "closet_item_id" IS NULL
      AND "inspiration_photo_id" IS NULL)
  );

-- 2) FavoriteItem: partial unique index so a user can only favorite each
-- inventory product once (the webUrl branch uses a separate partial index).
-- Prisma's @@unique can't express "unique when column is not null", so we
-- add it raw. The @@index([userId, inventoryProductId]) remains for reads.
CREATE UNIQUE INDEX favorite_items_user_product_uniq_idx
  ON "favorite_items" ("user_id", "inventory_product_id")
  WHERE "inventory_product_id" IS NOT NULL;

CREATE UNIQUE INDEX favorite_items_user_weburl_uniq_idx
  ON "favorite_items" ("user_id", "web_url")
  WHERE "web_url" IS NOT NULL;
