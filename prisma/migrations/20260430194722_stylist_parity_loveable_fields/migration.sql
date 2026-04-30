-- AlterTable: BoardPhoto freestyle layout positions
ALTER TABLE "board_photos" ADD COLUMN     "height" DOUBLE PRECISION,
ADD COLUMN     "width" DOUBLE PRECISION,
ADD COLUMN     "x" DOUBLE PRECISION,
ADD COLUMN     "y" DOUBLE PRECISION,
ADD COLUMN     "z_index" INTEGER;

-- AlterTable: Board moodboard canvas mode + profile board gender split
ALTER TABLE "boards" ADD COLUMN     "canvas_mode" TEXT,
ADD COLUMN     "profile_gender" "Gender";

-- AlterTable: StylistProfile structured fields (signature style, fashion icons, favorites, background, achievements, education)
ALTER TABLE "stylist_profiles" ADD COLUMN     "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "background" TEXT,
ADD COLUMN     "education" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fashion_icons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "favorite_items" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "signature_style" TEXT;
