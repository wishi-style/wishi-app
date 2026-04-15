-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('BOOKED', 'ACTIVE', 'PENDING_END', 'PENDING_END_APPROVAL', 'END_DECLINED', 'COMPLETED', 'FROZEN', 'REASSIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('MINI', 'MAJOR', 'LUX');

-- CreateEnum
CREATE TYPE "StylistType" AS ENUM ('IN_HOUSE', 'PLATFORM');

-- CreateEnum
CREATE TYPE "StylistOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PROFILE_CREATED', 'STRIPE_CONNECTED', 'AWAITING_ELIGIBILITY', 'ELIGIBLE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SESSION', 'UPGRADE', 'TIP', 'GIFT_CARD_PURCHASE', 'GIFT_CARD_REDEMPTION', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "PayoutTrigger" AS ENUM ('SESSION_COMPLETED', 'LUX_THIRD_LOOK', 'LUX_FINAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SubscriptionFrequency" AS ENUM ('MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "FitPreference" AS ENUM ('SLIM', 'REGULAR', 'RELAXED', 'OVERSIZED');

-- CreateEnum
CREATE TYPE "HeelPreference" AS ENUM ('FLAT', 'LOW', 'MEDIUM', 'HIGH', 'NO_PREFERENCE');

-- CreateEnum
CREATE TYPE "JewelryPreference" AS ENUM ('GOLD', 'SILVER', 'ROSE_GOLD', 'MIXED', 'NO_PREFERENCE');

-- CreateEnum
CREATE TYPE "BudgetCategory" AS ENUM ('TOPS', 'BOTTOMS', 'DRESSES', 'OUTERWEAR', 'SHOES', 'BAGS', 'JEWELRY', 'ACCESSORIES');

-- CreateEnum
CREATE TYPE "QuizType" AS ENUM ('MATCH', 'STYLE_PREFERENCE');

-- CreateEnum
CREATE TYPE "QuizQuestionType" AS ENUM ('SINGLE_SELECT', 'MULTI_SELECT', 'TEXT', 'NUMBER', 'RANGE', 'IMAGE_PICKER');

-- CreateEnum
CREATE TYPE "PendingActionType" AS ENUM ('PENDING_MOODBOARD', 'PENDING_STYLEBOARD', 'PENDING_CLIENT_FEEDBACK', 'PENDING_RESTYLE', 'PENDING_STYLIST_RESPONSE', 'PENDING_FOLLOWUP', 'PENDING_END_APPROVAL');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('OPEN', 'RESOLVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('PENDING', 'NOTIFIED', 'CONVERTED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "LoyaltyTier_new" AS ENUM ('BRONZE', 'GOLD', 'PLATINUM');
ALTER TABLE "public"."users" ALTER COLUMN "loyalty_tier" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "loyalty_tier" TYPE "LoyaltyTier_new" USING ("loyalty_tier"::text::"LoyaltyTier_new");
ALTER TYPE "LoyaltyTier" RENAME TO "LoyaltyTier_old";
ALTER TYPE "LoyaltyTier_new" RENAME TO "LoyaltyTier";
DROP TYPE "public"."LoyaltyTier_old";
ALTER TABLE "users" ALTER COLUMN "loyalty_tier" SET DEFAULT 'BRONZE';
COMMIT;

-- CreateTable
CREATE TABLE "style_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "style_preferences" TEXT[],
    "style_icons" TEXT[],
    "comfort_zone_level" INTEGER,
    "dress_code" TEXT,
    "occupation" TEXT,
    "typically_wears" TEXT,
    "needs_description" TEXT,
    "quiz_answers" JSONB,
    "quiz_completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "style_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body_type" TEXT,
    "body_issues" TEXT,
    "highlight_areas" TEXT[],
    "height" TEXT,
    "top_fit" "FitPreference",
    "bottom_fit" "FitPreference",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "body_sizes" (
    "id" TEXT NOT NULL,
    "body_profile_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "color_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "is_liked" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "color_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fabric_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fabric" TEXT NOT NULL,
    "is_disliked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fabric_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "is_disliked" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specific_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "denim_fit" TEXT,
    "dress_styles" TEXT[],
    "heel_preference" "HeelPreference",
    "jewelry_preference" "JewelryPreference",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specific_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_by_category" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "BudgetCategory" NOT NULL,
    "min_in_cents" INTEGER NOT NULL,
    "max_in_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_by_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stylist_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stylist_type" "StylistType" NOT NULL DEFAULT 'PLATFORM',
    "bio" TEXT,
    "philosophy" TEXT,
    "style_specialties" TEXT[],
    "style_expertise_levels" JSONB,
    "body_specialties" TEXT[],
    "gender_preference" "Gender"[],
    "budget_brackets" TEXT[],
    "expertise_by_gender" JSONB,
    "years_experience" INTEGER,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "director_pick" TEXT,
    "profile_moodboard_id" TEXT,
    "instagram_handle" TEXT,
    "onboarding_status" "StylistOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "onboarding_completed_at" TIMESTAMP(3),
    "match_eligible" BOOLEAN NOT NULL DEFAULT false,
    "match_eligible_set_at" TIMESTAMP(3),
    "match_eligible_set_by" TEXT,
    "stripe_connect_id" TEXT,
    "payout_percentage" INTEGER NOT NULL DEFAULT 70,
    "average_rating" DOUBLE PRECISION,
    "total_sessions_completed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stylist_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stylist_waitlist_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stylist_profile_id" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'PENDING',
    "notified_at" TIMESTAMP(3),
    "converted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stylist_waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stylist_reviews" (
    "id" TEXT NOT NULL,
    "stylist_profile_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "rating" INTEGER NOT NULL,
    "review_text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stylist_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_stylists" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stylist_profile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_stylists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "stylist_id" TEXT,
    "plan_type" "PlanType" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'BOOKED',
    "amount_paid_in_cents" INTEGER NOT NULL,
    "tip_in_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "moodboards_allowed" INTEGER NOT NULL DEFAULT 1,
    "styleboards_allowed" INTEGER NOT NULL,
    "bonus_boards_granted" INTEGER NOT NULL DEFAULT 0,
    "moodboards_sent" INTEGER NOT NULL DEFAULT 0,
    "styleboards_sent" INTEGER NOT NULL DEFAULT 0,
    "revisions_sent" INTEGER NOT NULL DEFAULT 0,
    "items_sent" INTEGER NOT NULL DEFAULT 0,
    "single_items_sent" INTEGER NOT NULL DEFAULT 0,
    "promo_code_id" TEXT,
    "is_membership" BOOLEAN NOT NULL DEFAULT false,
    "upgraded_at" TIMESTAMP(3),
    "upgraded_from_plan_type" "PlanType",
    "twilio_channel_sid" TEXT,
    "match_message" TEXT,
    "started_at" TIMESTAMP(3),
    "start_deadline" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "end_requested_at" TIMESTAMP(3),
    "end_approval_deadline" TIMESTAMP(3),
    "end_declined_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "frozen_at" TIMESTAMP(3),
    "frozen_reason" TEXT,
    "reassigned_at" TIMESTAMP(3),
    "rating" INTEGER,
    "review_text" TEXT,
    "rated_at" TIMESTAMP(3),
    "stripe_payment_intent_id" TEXT,
    "stripe_tip_payment_id" TEXT,
    "subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_pending_actions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" "PendingActionType" NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'OPEN',
    "board_id" TEXT,
    "message_id" TEXT,
    "due_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_match_history" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "stylist_id" TEXT NOT NULL,
    "matched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unmatched_at" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "session_match_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "type" "PlanType" NOT NULL,
    "name" TEXT NOT NULL,
    "price_in_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "moodboards" INTEGER NOT NULL DEFAULT 1,
    "styleboards" INTEGER NOT NULL,
    "payout_trigger" "PayoutTrigger" NOT NULL DEFAULT 'SESSION_COMPLETED',
    "lux_milestone_amount_cents" INTEGER,
    "lux_milestone_look_number" INTEGER,
    "additional_look_price_cents" INTEGER NOT NULL DEFAULT 2000,
    "subscription_available" BOOLEAN NOT NULL DEFAULT false,
    "defaults_to_subscription" BOOLEAN NOT NULL DEFAULT false,
    "stripe_product_id" TEXT,
    "stripe_price_id_one_time" TEXT,
    "stripe_price_id_subscription" TEXT,
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_id" TEXT,
    "type" "PaymentType" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_in_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripe_payment_intent_id" TEXT,
    "stripe_charge_id" TEXT,
    "gift_card_id" TEXT,
    "promo_code_id" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "stylist_profile_id" TEXT NOT NULL,
    "session_id" TEXT,
    "trigger" "PayoutTrigger" NOT NULL DEFAULT 'SESSION_COMPLETED',
    "amount_in_cents" INTEGER NOT NULL,
    "tip_in_cents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "stripe_transfer_id" TEXT,
    "skipped_reason" TEXT,
    "triggered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stylist_id" TEXT,
    "plan_type" "PlanType" NOT NULL,
    "pending_plan_type" "PlanType",
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "frequency" "SubscriptionFrequency" NOT NULL DEFAULT 'MONTHLY',
    "stripe_subscription_id" TEXT NOT NULL,
    "stripe_price_id" TEXT,
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "paused_until" TIMESTAMP(3),
    "cancel_requested_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "reactivated_at" TIMESTAMP(3),
    "last_payment_failed_at" TIMESTAMP(3),
    "payment_retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quizzes" (
    "id" TEXT NOT NULL,
    "type" "QuizType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "helper_text" TEXT,
    "question_type" "QuizQuestionType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB,
    "metadata" JSONB,
    "field_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "style_profiles_user_id_key" ON "style_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "body_profiles_user_id_key" ON "body_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "body_sizes_body_profile_id_category_key" ON "body_sizes"("body_profile_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "color_preferences_user_id_color_key" ON "color_preferences"("user_id", "color");

-- CreateIndex
CREATE UNIQUE INDEX "fabric_preferences_user_id_fabric_key" ON "fabric_preferences"("user_id", "fabric");

-- CreateIndex
CREATE UNIQUE INDEX "pattern_preferences_user_id_pattern_key" ON "pattern_preferences"("user_id", "pattern");

-- CreateIndex
CREATE UNIQUE INDEX "specific_preferences_user_id_key" ON "specific_preferences"("user_id");

-- CreateIndex
CREATE INDEX "budget_by_category_user_id_idx" ON "budget_by_category"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_by_category_user_id_category_key" ON "budget_by_category"("user_id", "category");

-- CreateIndex
CREATE UNIQUE INDEX "stylist_profiles_user_id_key" ON "stylist_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stylist_profiles_profile_moodboard_id_key" ON "stylist_profiles"("profile_moodboard_id");

-- CreateIndex
CREATE UNIQUE INDEX "stylist_profiles_stripe_connect_id_key" ON "stylist_profiles"("stripe_connect_id");

-- CreateIndex
CREATE INDEX "stylist_profiles_stylist_type_idx" ON "stylist_profiles"("stylist_type");

-- CreateIndex
CREATE INDEX "stylist_profiles_is_available_idx" ON "stylist_profiles"("is_available");

-- CreateIndex
CREATE INDEX "stylist_profiles_match_eligible_idx" ON "stylist_profiles"("match_eligible");

-- CreateIndex
CREATE INDEX "stylist_profiles_onboarding_status_idx" ON "stylist_profiles"("onboarding_status");

-- CreateIndex
CREATE INDEX "stylist_profiles_match_eligible_is_available_idx" ON "stylist_profiles"("match_eligible", "is_available");

-- CreateIndex
CREATE INDEX "stylist_waitlist_entries_stylist_profile_id_status_idx" ON "stylist_waitlist_entries"("stylist_profile_id", "status");

-- CreateIndex
CREATE INDEX "stylist_waitlist_entries_user_id_idx" ON "stylist_waitlist_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stylist_waitlist_entries_user_id_stylist_profile_id_key" ON "stylist_waitlist_entries"("user_id", "stylist_profile_id");

-- CreateIndex
CREATE INDEX "stylist_reviews_stylist_profile_id_created_at_idx" ON "stylist_reviews"("stylist_profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stylist_reviews_user_id_stylist_profile_id_key" ON "stylist_reviews"("user_id", "stylist_profile_id");

-- CreateIndex
CREATE INDEX "favorite_stylists_user_id_idx" ON "favorite_stylists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_stylists_user_id_stylist_profile_id_key" ON "favorite_stylists"("user_id", "stylist_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_twilio_channel_sid_key" ON "sessions"("twilio_channel_sid");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_stripe_payment_intent_id_key" ON "sessions"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_stripe_tip_payment_id_key" ON "sessions"("stripe_tip_payment_id");

-- CreateIndex
CREATE INDEX "sessions_client_id_idx" ON "sessions"("client_id");

-- CreateIndex
CREATE INDEX "sessions_stylist_id_idx" ON "sessions"("stylist_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_created_at_idx" ON "sessions"("created_at");

-- CreateIndex
CREATE INDEX "sessions_deleted_at_idx" ON "sessions"("deleted_at");

-- CreateIndex
CREATE INDEX "sessions_subscription_id_idx" ON "sessions"("subscription_id");

-- CreateIndex
CREATE INDEX "session_pending_actions_session_id_idx" ON "session_pending_actions"("session_id");

-- CreateIndex
CREATE INDEX "session_pending_actions_status_due_at_idx" ON "session_pending_actions"("status", "due_at");

-- CreateIndex
CREATE INDEX "session_pending_actions_session_id_status_idx" ON "session_pending_actions"("session_id", "status");

-- CreateIndex
CREATE INDEX "session_pending_actions_type_idx" ON "session_pending_actions"("type");

-- CreateIndex
CREATE INDEX "session_match_history_session_id_idx" ON "session_match_history"("session_id");

-- CreateIndex
CREATE INDEX "session_match_history_client_id_idx" ON "session_match_history"("client_id");

-- CreateIndex
CREATE INDEX "session_match_history_stylist_id_idx" ON "session_match_history"("stylist_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_type_key" ON "plans"("type");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_product_id_key" ON "plans"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_price_id_one_time_key" ON "plans"("stripe_price_id_one_time");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripe_price_id_subscription_key" ON "plans"("stripe_price_id_subscription");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_intent_id_key" ON "payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_session_id_idx" ON "payments"("session_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_stripe_payment_intent_id_idx" ON "payments"("stripe_payment_intent_id");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_stripe_transfer_id_key" ON "payouts"("stripe_transfer_id");

-- CreateIndex
CREATE INDEX "payouts_stylist_profile_id_idx" ON "payouts"("stylist_profile_id");

-- CreateIndex
CREATE INDEX "payouts_status_idx" ON "payouts"("status");

-- CreateIndex
CREATE INDEX "payouts_trigger_idx" ON "payouts"("trigger");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_session_id_trigger_key" ON "payouts"("session_id", "trigger");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_subscription_id_idx" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "quizzes_type_key" ON "quizzes"("type");

-- CreateIndex
CREATE INDEX "quiz_questions_quiz_id_idx" ON "quiz_questions"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_questions_sort_order_idx" ON "quiz_questions"("sort_order");

-- AddForeignKey
ALTER TABLE "style_profiles" ADD CONSTRAINT "style_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_profiles" ADD CONSTRAINT "body_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_sizes" ADD CONSTRAINT "body_sizes_body_profile_id_fkey" FOREIGN KEY ("body_profile_id") REFERENCES "body_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "color_preferences" ADD CONSTRAINT "color_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fabric_preferences" ADD CONSTRAINT "fabric_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_preferences" ADD CONSTRAINT "pattern_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "specific_preferences" ADD CONSTRAINT "specific_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_by_category" ADD CONSTRAINT "budget_by_category_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stylist_profiles" ADD CONSTRAINT "stylist_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stylist_waitlist_entries" ADD CONSTRAINT "stylist_waitlist_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stylist_waitlist_entries" ADD CONSTRAINT "stylist_waitlist_entries_stylist_profile_id_fkey" FOREIGN KEY ("stylist_profile_id") REFERENCES "stylist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stylist_reviews" ADD CONSTRAINT "stylist_reviews_stylist_profile_id_fkey" FOREIGN KEY ("stylist_profile_id") REFERENCES "stylist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stylist_reviews" ADD CONSTRAINT "stylist_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stylist_reviews" ADD CONSTRAINT "stylist_reviews_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_stylists" ADD CONSTRAINT "favorite_stylists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_stylists" ADD CONSTRAINT "favorite_stylists_stylist_profile_id_fkey" FOREIGN KEY ("stylist_profile_id") REFERENCES "stylist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_stylist_id_fkey" FOREIGN KEY ("stylist_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_pending_actions" ADD CONSTRAINT "session_pending_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_match_history" ADD CONSTRAINT "session_match_history_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_match_history" ADD CONSTRAINT "session_match_history_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_stylist_profile_id_fkey" FOREIGN KEY ("stylist_profile_id") REFERENCES "stylist_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

