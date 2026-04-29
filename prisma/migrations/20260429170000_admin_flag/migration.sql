-- Admin becomes a permission, not a role.
-- Add User.is_admin flag, backfill existing role='ADMIN' rows to CLIENT+is_admin=true,
-- then drop ADMIN from the UserRole enum so route guards stop having to name it.

-- 1. Add the flag
ALTER TABLE "users" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Backfill: every current ADMIN becomes a CLIENT with isAdmin=true
UPDATE "users" SET "is_admin" = TRUE WHERE "role" = 'ADMIN';
UPDATE "users" SET "role" = 'CLIENT' WHERE "role" = 'ADMIN';

-- 3. Drop ADMIN from the UserRole enum (Postgres enum-rebuild idiom)
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'STYLIST');
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'CLIENT';
DROP TYPE "UserRole_old";

-- Hot-path lookup for admin tools that filter "is this user an admin"
CREATE INDEX "users_is_admin_idx" ON "users"("is_admin") WHERE "is_admin" = TRUE;
