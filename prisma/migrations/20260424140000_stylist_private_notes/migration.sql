-- Phase 12 follow-up: stylist-authored private notes on clients they style.
-- Exactly one note per (stylist, client) pair; the stylist edits in place.

CREATE TABLE "stylist_private_notes" (
    "id" TEXT NOT NULL,
    "stylist_user_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stylist_private_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stylist_private_notes_stylist_user_id_client_user_id_key"
  ON "stylist_private_notes"("stylist_user_id", "client_user_id");

CREATE INDEX "stylist_private_notes_stylist_user_id_idx"
  ON "stylist_private_notes"("stylist_user_id");

ALTER TABLE "stylist_private_notes"
  ADD CONSTRAINT "stylist_private_notes_stylist_user_id_fkey"
  FOREIGN KEY ("stylist_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stylist_private_notes"
  ADD CONSTRAINT "stylist_private_notes_client_user_id_fkey"
  FOREIGN KEY ("client_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
