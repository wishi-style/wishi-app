-- Phase 12: canvas styleboard support
-- Adds the columns LookCreator needs to persist a drag-drop composition
-- plus the title/description/tags the save dialog collects.

ALTER TABLE "boards"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "board_items"
  ADD COLUMN "x" DOUBLE PRECISION,
  ADD COLUMN "y" DOUBLE PRECISION,
  ADD COLUMN "z_index" INTEGER;
