-- Phase 11 performance indexes
--
-- Added after auditing query hotspots against the new EasyPost webhook
-- path, the dashboard filter queries, and the /feed listing. All are
-- additive B-tree indexes — no schema or data migration.
--
-- Production rollout note: these are small tables pre-launch (<100k rows),
-- so a plain CREATE INDEX completes in milliseconds. Post-launch, if these
-- need to be re-applied on a warm DB, run manually with CREATE INDEX
-- CONCURRENTLY outside the Prisma migration transaction.

-- EasyPost webhook lookup: findFirst({ where: { trackingNumber } })
CREATE INDEX "orders_tracking_number_idx" ON "orders" ("tracking_number");

-- Client dashboard "my sessions by status" + stylist client list by status
CREATE INDEX "sessions_client_id_status_idx" ON "sessions" ("client_id", "status");
CREATE INDEX "sessions_stylist_id_status_idx" ON "sessions" ("stylist_id", "status");

-- /feed query: type=STYLEBOARD + isFeaturedOnProfile=true, ordered by createdAt desc
CREATE INDEX "boards_type_is_featured_on_profile_created_at_idx"
  ON "boards" ("type", "is_featured_on_profile", "created_at" DESC);
