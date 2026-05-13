-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM (
    'TIP',
    'BOOKING',
    'MESSAGE',
    'SESSION',
    'REVIEW',
    'PAYOUT',
    'ORDER',
    'SUBSCRIPTION',
    'STYLIST_AVAILABILITY',
    'AFFILIATE',
    'PLATFORM'
);

-- CreateEnum
CREATE TYPE "NotificationSource" AS ENUM (
    'CLIENT',
    'PLATFORM'
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "source" "NotificationSource" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_user_id_fkey";

-- DropTable
DROP TABLE IF EXISTS "push_subscriptions";
