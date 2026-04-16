-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('MOODBOARD', 'STYLEBOARD');

-- CreateEnum
CREATE TYPE "BoardRating" AS ENUM ('LOVE', 'REVISE', 'NOT_MY_STYLE');

-- CreateEnum
CREATE TYPE "BoardItemSource" AS ENUM ('INVENTORY', 'CLOSET', 'INSPIRATION_PHOTO', 'WEB_ADDED');

-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "type" "BoardType" NOT NULL,
    "session_id" TEXT,
    "stylist_profile_id" TEXT,
    "is_featured_on_profile" BOOLEAN NOT NULL DEFAULT false,
    "profile_style" TEXT,
    "parent_board_id" TEXT,
    "is_revision" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "stylist_note" TEXT,
    "sent_at" TIMESTAMP(3),
    "rating" "BoardRating",
    "feedback_text" TEXT,
    "rated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_items" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "source" "BoardItemSource" NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "inventory_product_id" TEXT,
    "closet_item_id" TEXT,
    "inspiration_photo_id" TEXT,
    "web_item_url" TEXT,
    "web_item_title" TEXT,
    "web_item_brand" TEXT,
    "web_item_price_in_cents" INTEGER,
    "web_item_image_url" TEXT,
    "reaction" "BoardRating",
    "feedback_text" TEXT,
    "suggested_feedback" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_photos" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "inspiration_photo_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspiration_photos" (
    "id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "category" TEXT,
    "tags" TEXT[],
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "inspiration_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closet_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "designer" TEXT,
    "season" TEXT,
    "category" TEXT,
    "colors" TEXT[],
    "size" TEXT,
    "material" TEXT,
    "source_order_item_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "closet_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "inventory_product_id" TEXT,
    "web_url" TEXT,
    "web_item_title" TEXT,
    "web_item_brand" TEXT,
    "web_item_image_url" TEXT,
    "web_item_price_in_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_boards" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_boards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boards_session_id_type_sent_at_idx" ON "boards"("session_id", "type", "sent_at");

-- CreateIndex
CREATE INDEX "boards_stylist_profile_id_is_featured_on_profile_profile_st_idx" ON "boards"("stylist_profile_id", "is_featured_on_profile", "profile_style");

-- CreateIndex
CREATE INDEX "boards_parent_board_id_idx" ON "boards"("parent_board_id");

-- CreateIndex
CREATE INDEX "board_items_board_id_order_index_idx" ON "board_items"("board_id", "order_index");

-- CreateIndex
CREATE INDEX "board_items_closet_item_id_idx" ON "board_items"("closet_item_id");

-- CreateIndex
CREATE INDEX "board_items_inspiration_photo_id_idx" ON "board_items"("inspiration_photo_id");

-- CreateIndex
CREATE INDEX "board_items_inventory_product_id_idx" ON "board_items"("inventory_product_id");

-- CreateIndex
CREATE INDEX "board_photos_board_id_order_index_idx" ON "board_photos"("board_id", "order_index");

-- CreateIndex
CREATE INDEX "board_photos_inspiration_photo_id_idx" ON "board_photos"("inspiration_photo_id");

-- CreateIndex
CREATE INDEX "inspiration_photos_category_idx" ON "inspiration_photos"("category");

-- CreateIndex
CREATE INDEX "inspiration_photos_deleted_at_idx" ON "inspiration_photos"("deleted_at");

-- CreateIndex
CREATE INDEX "closet_items_user_id_idx" ON "closet_items"("user_id");

-- CreateIndex
CREATE INDEX "closet_items_user_id_category_idx" ON "closet_items"("user_id", "category");

-- CreateIndex
CREATE INDEX "closet_items_user_id_designer_idx" ON "closet_items"("user_id", "designer");

-- CreateIndex
CREATE INDEX "closet_items_user_id_deleted_at_idx" ON "closet_items"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "favorite_items_user_id_idx" ON "favorite_items"("user_id");

-- CreateIndex
CREATE INDEX "favorite_items_user_id_inventory_product_id_idx" ON "favorite_items"("user_id", "inventory_product_id");

-- CreateIndex
CREATE INDEX "favorite_boards_user_id_idx" ON "favorite_boards"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_boards_user_id_board_id_key" ON "favorite_boards"("user_id", "board_id");

-- CreateIndex
CREATE INDEX "messages_board_id_idx" ON "messages"("board_id");

-- AddForeignKey
ALTER TABLE "stylist_profiles" ADD CONSTRAINT "stylist_profiles_profile_moodboard_id_fkey" FOREIGN KEY ("profile_moodboard_id") REFERENCES "boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_stylist_profile_id_fkey" FOREIGN KEY ("stylist_profile_id") REFERENCES "stylist_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_parent_board_id_fkey" FOREIGN KEY ("parent_board_id") REFERENCES "boards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_closet_item_id_fkey" FOREIGN KEY ("closet_item_id") REFERENCES "closet_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_items" ADD CONSTRAINT "board_items_inspiration_photo_id_fkey" FOREIGN KEY ("inspiration_photo_id") REFERENCES "inspiration_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_photos" ADD CONSTRAINT "board_photos_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_photos" ADD CONSTRAINT "board_photos_inspiration_photo_id_fkey" FOREIGN KEY ("inspiration_photo_id") REFERENCES "inspiration_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closet_items" ADD CONSTRAINT "closet_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_items" ADD CONSTRAINT "favorite_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_boards" ADD CONSTRAINT "favorite_boards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_boards" ADD CONSTRAINT "favorite_boards_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===== Phase 4 polymorphism constraints =====

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

-- 2) FavoriteItem: partial unique indexes for polymorphic user↔product/webUrl unique
CREATE UNIQUE INDEX favorite_items_user_product_uniq_idx
  ON "favorite_items" ("user_id", "inventory_product_id")
  WHERE "inventory_product_id" IS NOT NULL;

CREATE UNIQUE INDEX favorite_items_user_weburl_uniq_idx
  ON "favorite_items" ("user_id", "web_url")
  WHERE "web_url" IS NOT NULL;
