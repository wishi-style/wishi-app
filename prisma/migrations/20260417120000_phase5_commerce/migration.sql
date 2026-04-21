-- Phase 5: Inventory Integration & Click-Through Tracking
-- Adds Order / OrderItem / AffiliateClick / MerchandisedProduct models
-- and resolves the deferred affiliateClicks relation on Session.

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('DIRECT_SALE', 'SELF_REPORTED', 'AFFILIATE_CONFIRMED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ARRIVED', 'RETURNED');

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "source" "OrderSource" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "retailer" TEXT NOT NULL,
    "total_in_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "arrived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "inventory_product_id" TEXT NOT NULL,
    "inventory_listing_id" TEXT,
    "title" TEXT NOT NULL,
    "brand" TEXT,
    "image_url" TEXT,
    "price_in_cents" INTEGER NOT NULL DEFAULT 0,
    "size" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "inventory_product_id" TEXT NOT NULL,
    "inventory_listing_id" TEXT,
    "retailer" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "session_id" TEXT,
    "board_id" TEXT,
    "order_id" TEXT,
    "clicked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prompt_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchandised_products" (
    "id" TEXT NOT NULL,
    "inventory_product_id" TEXT NOT NULL,
    "is_direct_sale" BOOLEAN NOT NULL DEFAULT false,
    "admin_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchandised_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_user_id_idx" ON "orders"("user_id");
CREATE INDEX "orders_session_id_idx" ON "orders"("session_id");
CREATE INDEX "orders_source_idx" ON "orders"("source");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");
CREATE INDEX "order_items_inventory_product_id_idx" ON "order_items"("inventory_product_id");

-- CreateIndex
CREATE INDEX "affiliate_clicks_user_id_idx" ON "affiliate_clicks"("user_id");
CREATE INDEX "affiliate_clicks_session_id_idx" ON "affiliate_clicks"("session_id");
CREATE INDEX "affiliate_clicks_inventory_product_id_idx" ON "affiliate_clicks"("inventory_product_id");
CREATE INDEX "affiliate_clicks_retailer_idx" ON "affiliate_clicks"("retailer");
CREATE INDEX "affiliate_clicks_clicked_at_idx" ON "affiliate_clicks"("clicked_at");
CREATE INDEX "affiliate_clicks_prompt_sent_at_idx" ON "affiliate_clicks"("prompt_sent_at");
CREATE INDEX "affiliate_clicks_order_id_idx" ON "affiliate_clicks"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "merchandised_products_inventory_product_id_key" ON "merchandised_products"("inventory_product_id");
CREATE INDEX "merchandised_products_is_direct_sale_idx" ON "merchandised_products"("is_direct_sale");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
