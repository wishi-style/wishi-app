-- Backfill the @@unique([quizId, sortOrder]) composite from schema.prisma
-- that was missing from the phase2 migration. The upsert in
-- prisma/seeds/quizzes.ts uses `where: { quizId_sortOrder: ... }` which
-- requires this index to exist on the database — without it the seed fails
-- with "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" on a fresh DB.
--
-- Safe on existing DBs where this was added by hand via `prisma migrate
-- dev` locally; the CREATE UNIQUE INDEX is idempotent-guarded.

CREATE UNIQUE INDEX IF NOT EXISTS "quiz_questions_quiz_id_sort_order_key"
  ON "quiz_questions" ("quiz_id", "sort_order");
