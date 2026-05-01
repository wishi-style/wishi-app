/*
  Warnings:

  - Made the column `session_id` on table `cart_items` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_session_id_fkey";

-- AlterTable
ALTER TABLE "body_profiles" ADD COLUMN     "body_areas_mindful" TEXT[],
ADD COLUMN     "necklines_avoid" TEXT[];

-- AlterTable
ALTER TABLE "cart_items" ALTER COLUMN "session_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "style_profiles" ADD COLUMN     "avoid_brands" TEXT[],
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "occasions" TEXT[],
ADD COLUMN     "pieces_needed" TEXT[],
ADD COLUMN     "preferred_brands" TEXT[],
ADD COLUMN     "shopping_values" TEXT[];

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
