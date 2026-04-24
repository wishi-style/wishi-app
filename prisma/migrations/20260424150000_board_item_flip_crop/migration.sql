-- Phase 12 follow-up: LookCreator canvas flip + crop affordances.
-- flipH / flipV mirror the image on the canvas; crop_* are percent insets
-- (0–100) from each edge. Defaults keep legacy rows visually unchanged.

ALTER TABLE "board_items"
  ADD COLUMN "flip_h" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "flip_v" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crop_top" DOUBLE PRECISION,
  ADD COLUMN "crop_right" DOUBLE PRECISION,
  ADD COLUMN "crop_bottom" DOUBLE PRECISION,
  ADD COLUMN "crop_left" DOUBLE PRECISION;
