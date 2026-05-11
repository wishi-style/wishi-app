-- Replace the strict UNIQUE(email) constraint with a partial unique index
-- that excludes soft-deleted rows. Without this change, soft-deleting a user
-- permanently locks their email from re-signup: the new signup hits P2002
-- on email and `reconcileClerkUser` rethrows, leaving the new Clerk user
-- with no DB row and empty publicMetadata. See the lia@wishi.me incident on
-- 2026-05-06 for the full repro.
--
-- Net effect:
--   - Active rows still see one row per email (the partial unique).
--   - A soft-deleted row no longer blocks a fresh signup with the same email.
--   - Re-signup creates a new active row alongside the soft-deleted one.
--     If you later need "resurrect old data on re-signup", that's a product
--     decision implemented separately — this migration only removes the
--     hard wall.

-- The unique-on-email exists under two different names depending on when the
-- DB was bootstrapped: pre-Prisma-7 envs carry `users_email_key` (the Prisma
-- default), post-rebuild envs carry `users_email_key_c`. Drop both
-- conditionally — at most one will exist on any given environment, and we
-- just need (email) to no longer be strictly unique by the time the partial
-- unique below goes in.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'users'::regclass AND conname = 'users_email_key_c'
  ) THEN
    ALTER TABLE "users" DROP CONSTRAINT "users_email_key_c";
  END IF;
END $$;

DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "users_email_key_c";

CREATE UNIQUE INDEX "users_email_active_unique"
  ON "users" ("email")
  WHERE "deleted_at" IS NULL;
