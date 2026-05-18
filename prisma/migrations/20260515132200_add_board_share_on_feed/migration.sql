-- Boards: opt-in to the public discovery feed independently from profile-page
-- feature status. Moodboards reach the feed exclusively through this flag
-- (profile pages remain styleboard-only); styleboards can opt in alongside
-- their existing profile-board path.

ALTER TABLE "boards"
  ADD COLUMN "share_on_feed" BOOLEAN NOT NULL DEFAULT false;

-- Feed pagination orders by createdAt desc and filters on sentAt being set, so
-- this composite index keeps the new OR-branch of the feed query off a seqscan.
CREATE INDEX "boards_share_on_feed_sent_at_created_at_idx"
  ON "boards" ("share_on_feed", "sent_at", "created_at" DESC);
