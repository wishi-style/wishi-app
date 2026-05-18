-- Free-form styleboard canvas: per-item width (percent of canvas, 1-100),
-- free rotation (degrees in [-180, 180); 180 normalises to -180), and a server-side background-removed
-- image URL. All nullable; existing rows render with the prior 30% fallback
-- width, 0deg rotation, and original imagery.

ALTER TABLE "board_items"
  ADD COLUMN "width" DOUBLE PRECISION,
  ADD COLUMN "rotation" DOUBLE PRECISION,
  ADD COLUMN "processed_image_url" TEXT;
