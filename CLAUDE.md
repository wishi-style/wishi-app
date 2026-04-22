@AGENTS.md

# Wishi Platform — Client Web App

## What is this

Wishi is a styling marketplace. This repo is the Next.js 16 monolith (client, stylist, and admin route groups) deployed on AWS ECS Fargate.

## Stack

- **Framework:** Next.js 16 (App Router, TypeScript strict, Turbopack)
- **Styling:** Tailwind CSS 4 + shadcn/ui (Nova preset, Radix base)
- **Database:** RDS Postgres 16 via RDS Proxy, Prisma 7 ORM with PG adapter
- **Auth:** Clerk (Google + Apple + Email) with RBAC via publicMetadata
- **Payments:** Stripe (one-time + subscription checkout, webhooks, billing portal)
- **Chat:** Twilio Conversations (real-time messaging, media, Web Push notifications)
- **Infra:** AWS ECS Fargate, ALB, S3, Secrets Manager, CloudWatch
- **IaC:** Terraform (S3 backend, per-env tfvars)
- **CI/CD:** GitHub Actions (OIDC auth to AWS)
- **Docker:** Multi-stage build, node:22-alpine, standalone output

## Repo structure

```
wishi-app/
├── .github/workflows/    CI/CD pipelines
├── docker/Dockerfile      Multi-stage build
├── infra/
│   ├── bootstrap/         One-time: state bucket, ECR, OIDC roles
│   ├── modules/           network, database, storage, secrets, service, observability
│   ├── staging.tfvars     Staging config
│   └── production.tfvars  Production config
├── prisma/
│   ├── schema.prisma      37 models, 27 enums
│   ├── seed.ts            Entry point for seeding (Plans, Quizzes)
│   └── seeds/             Domain seeders (plans.ts, quizzes.ts)
├── src/
│   ├── app/
│   │   ├── (client)/      Client routes: /sessions, /sessions/[id]/chat, /bookings, /settings
│   │   ├── (stylist)/     Stylist routes: /stylist/dashboard, /stylist/sessions, /stylist/sessions/[id]/chat
│   │   ├── (admin)/       Admin routes: /admin/*
│   │   ├── api/           health, webhooks/{clerk,stripe,twilio}, uploads, stylists, subscriptions, billing, chat/{token,media}, push/{subscribe,vapid-key}
│   │   ├── match-quiz/    Public match quiz (guest + authenticated)
│   │   ├── stylists/      Public stylist directory + profiles
│   │   ├── sign-in/       Clerk sign-in
│   │   └── sign-up/       Clerk sign-up
│   ├── components/        nav/, profile/, quiz/, stylist/, session/, booking/, chat/, ui/
│   ├── generated/prisma/  Generated client (gitignored)
│   └── lib/               prisma.ts, stripe.ts, twilio.ts, auth/, payments/, quiz/, matching/, sessions/, services/, chat/, web-push.ts, s3.ts, plans.ts
├── next.config.ts         output: standalone
└── prisma.config.ts       Prisma 7 config
```

## Key conventions

- **Prisma client:** Lazy-initialized via Proxy pattern in `src/lib/prisma.ts` — does not throw at import time (required for Docker builds without DATABASE_URL)
- **API routes that hit the DB:** Must export `const dynamic = "force-dynamic"` to prevent Next.js from pre-rendering at build time
- **Secrets:** All secrets in AWS Secrets Manager under `wishi/<env>/` — never in env vars or GitHub Secrets
- **Auth guards:** Use `requireRole()` from `src/lib/auth` in route group layouts. Use `requireAuth()` for role-agnostic auth checks. Both call `unauthorized()`/`forbidden()` from `next/navigation`.
- **Clerk types:** Import `UserRole` and other Prisma enums from `@/generated/prisma/client` (not `@/generated/prisma`)
- **Proxy (not middleware):** Next.js 16 uses `src/proxy.ts` with `export default clerkMiddleware()`. The file convention is `proxy`, not `middleware`.
- **Route groups:** `(client)` routes at `/sessions`, `/settings` etc. `(stylist)` routes at `/stylist/*`. `(admin)` routes at `/admin/*`. No overlapping paths between groups.
- **S3 uploads:** Use presigned PUT URLs via `src/lib/s3.ts`. Client uploads directly to S3, then confirms via Server Action.
- **DB connections:** Always use `?sslmode=require` — RDS rejects unencrypted connections
- **Docker builds:** Build context is the repo root, Dockerfile at `docker/Dockerfile`, target platform `linux/amd64`
- **Terraform:** Bootstrap applied locally with admin creds. Main infra uses S3 backend (`terraform init -backend-config=staging.tfbackend`)
- **Stripe client:** Lazy-initialized via Proxy pattern in `src/lib/stripe.ts` (same pattern as prisma.ts)
- **Quiz engine:** Data-driven quiz renderer. Quiz questions live in DB (`Quiz`/`QuizQuestion` tables), seeded via `prisma/seeds/quizzes.ts`. `fieldKey` on each question maps to the destination model via `src/lib/quiz/field-router.ts`.
- **Twilio client:** Lazy-initialized via Proxy pattern in `src/lib/twilio.ts` (same pattern as prisma.ts/stripe.ts). `getTwilioConfig()` returns the raw config values for AccessToken construction.
- **Chat architecture:** Twilio Conversations handles real-time transport. Messages are mirrored to the `Message` table via `/api/webhooks/twilio`. Twilio identity = `user.clerkId`. Message metadata (kind, mediaUrl, boardId) lives in Twilio message `attributes` JSON, not the body.
- **System messages:** Templates in `src/lib/chat/system-templates.ts`. Sent via Twilio API with `author: "system"` and `kind: SYSTEM_AUTOMATED` in attributes. Phase 4 wires the actual triggers.
- **Twilio REST messages and webhooks:** Server-sent messages via the Twilio REST API DO NOT fire webhooks by default — Twilio suppresses them to prevent infinite loops where a webhook handler that sends a message would trigger another webhook. To make a server-sent message persist via our `/api/webhooks/twilio` handler, pass `xTwilioWebhookEnabled: "true"` to `messages.create()`. Currently used for the WELCOME system message in `createChatConversation`.
- **Local Twilio webhooks:** Twilio webhooks need a public URL — `localhost:3000` is unreachable. For local dev, set `TWILIO_WEBHOOK_URL` in `.env` to your ngrok tunnel URL (`ngrok http 3000`) and configure the same URL on the Twilio Conversations Service webhook config. The route handler uses `TWILIO_WEBHOOK_URL` for signature verification when set; otherwise reconstructs from `X-Forwarded-*` headers (which is what works in deployed envs behind ALB).
- **Deferred relations:** Session.promoCode + Payment.giftCard / Payment.promoCode relations were resolved in Phase 9 (previously plain String? stubs). Phase 5 resolved `Session.orders` and `Session.affiliateClicks`.
- **Boards (Phase 4):** Polymorphic `Board` (`type = MOODBOARD | STYLEBOARD`). `BoardItem.source` = `INVENTORY | CLOSET | INSPIRATION_PHOTO | WEB_ADDED` with a raw-SQL CHECK constraint enforcing exactly one source field is populated. Restyles live as `Board(type=STYLEBOARD, isRevision=true, parentBoardId=<original>)`. Profile boards (used in Phase 6 stylist onboarding) are `Board(sessionId=null, stylistProfileId=<self>, isFeaturedOnProfile=true, profileStyle=<style>)`. **After running `npx prisma migrate dev --name phase4_boards`, apply `prisma/migrations/phase4_constraints.sql` by hand** (Prisma can't express the polymorphism CHECK or the partial unique indexes on `favorite_items`).
- **Pending actions:** `src/lib/pending-actions/` exposes `openAction(sessionId, type, opts)` / `resolveAction(sessionId, type, opts)` / `expireAction(id)`. Default `dueAt` offsets (24h/48h/72h/6h) live in `policy.ts` so they can be tuned without a schema change. Every state-transition in `src/lib/sessions/transitions.ts` and `src/lib/boards/*.service.ts` rolls actions atomically in a transaction.
- **Admin (Phase 8):** `(admin)` route group uses `requireAdmin()` (resolves Prisma user + `act` claim detection). Every admin mutation writes an `AuditLog` row via `writeAudit({ actorUserId, action, entityType, entityId, meta })` from `src/lib/audit/log.ts`. Session/subscription override predicates live in `src/lib/services/admin-guards.ts` as pure functions for testability. Impersonation uses Clerk actor tokens (`clerkClient().actorTokens.create`) → the `act` claim on the impersonated session is detected by `ImpersonationBannerMount` in the root layout and by `assertNotImpersonating()` for destructive-action guards. Quiz builder rewrites all `QuizQuestion` rows in a single transaction using a two-pass `sortOrder` offset (temp 100000+i then target i) to avoid `(quizId, sortOrder)` unique-constraint conflicts.
- **Session transitions:** `src/lib/sessions/transitions.ts` owns `activateSession`, `requestEnd`, `approveEnd`, `declineEnd`, `freezeSession`, `unfreezeSession`, `detectPendingEnd`. Each mutation (a) updates the session, (b) writes a SYSTEM_AUTOMATED chat message via `sendSystemMessage`, (c) rolls pending actions, (d) fan-outs notifications via `lib/notifications/dispatcher.ts`.
- **Inventory service:** Wishi does NOT store product data locally. `src/lib/inventory/inventory-client.ts` proxies the tastegraph inventory service (`INVENTORY_SERVICE_URL`). 5-minute in-process cache; returns empty arrays on failure so the board builder's Inventory tab degrades gracefully. `inventoryProductId` stored on `BoardItem` / `Message.singleItemInventoryProductId` / `FavoriteItem` is a plain string — resolve it via `/api/products/[id]` at render time.
- **Sending boards through chat:** Board helpers use Twilio REST with `xTwilioWebhookEnabled="true"` so the webhook handler persists the `Message` row with `kind = MOODBOARD|STYLEBOARD|RESTYLE` + `boardId` attribute. `src/lib/chat/send-message.ts` centralizes the Twilio call; don't call `twilioClient.conversations...messages.create` directly from service code.
- **Prisma JSON fields:** Use `as Prisma.InputJsonValue` when passing `Record<string, unknown>` to JSON columns — Prisma's strict types reject plain Records.
- **Seeding:** `npx prisma db seed` or `npx tsx prisma/seed.ts` with DATABASE_URL set. Seeds are idempotent (upserts).
- **Workers (Phase 5/6):** Scheduled background jobs live under `src/workers/`. `entry.ts` reads `process.env.WORKER` and dispatches to a handler. One shared ECS task definition (`docker/Dockerfile.worker`) is invoked by `aws_scheduler_schedule` rules in `infra/modules/workers` and `infra/modules/scheduler` — the scheduler passes `WORKER=<name>` via `containerOverrides`. Phase 5 handlers: `affiliate-ingest` (daily), `affiliate-prompt` (15m), `pending-action-expiry` (15m, owns `session.overdue` notification emission — Phase 6's dashboard only reads the already-flipped `SessionPendingAction.status = EXPIRED`), `stale-cleanup` (daily). Phase 6 handlers: `waitlist-notify` (hourly), `payout-reconcile` (Mondays 06:00 UTC) — guarded by `src/lib/workers/auth.ts` (`x-worker-secret` header matched against `WORKER_SHARED_SECRET`; fails closed when unset). Admin UI can fire any worker manually via `POST /api/admin/workers/[name]/run` for staging verification.
- **Affiliate tracking (Phase 5):** Click-through commerce lives in `src/lib/affiliate/`, `src/lib/orders/`, `src/lib/closet/`. A client click on a product writes an `AffiliateClick`. 24h later the `affiliate-prompt` worker fires `affiliate.purchase_check`; the user replies "yes" via `POST /api/affiliate/self-report`, which creates `Order(SELF_REPORTED)` + `OrderItem` and auto-creates `ClosetItem` rows. Nightly, `affiliate-ingest` polls `/internal/commissions` and either upgrades that order to `AFFILIATE_CONFIRMED` (dedup branch B) or creates a fresh confirmed order (branch C). `ClosetItem.sourceOrderItemId` links each closet entry back to its Order. `POST /api/closet/from-url` is inline (not a worker) — parses Open Graph and uploads to S3 in the request.
- **Payouts (Phase 6):** `src/lib/payouts/dispatch.service.ts` is the single write path for `Payout` rows + Stripe Transfers. Idempotent via `@@unique([sessionId, trigger])` — re-runs for the same (session, trigger) return `{ status: "SKIPPED", reason: "idempotent" }`. Three paths: IN_HOUSE stylist → row written with `status=SKIPPED, skippedReason="in_house_stylist"`, no Stripe call; PLATFORM + `payoutsEnabled=false` → row written with `status=PENDING, skippedReason="connect_not_ready"`, no Stripe call; PLATFORM happy → PENDING → `stripe.transfers.create` → PROCESSING with `stripeTransferId`. Test seam: pass `deps.createTransfer` to mock Stripe in integration tests. `completionTriggerFor(plan)` maps `Plan.payoutTrigger` to `SESSION_COMPLETED` (Mini/Major) or `LUX_FINAL` (Lux). The Lux-milestone `LUX_THIRD_LOOK` payout fires from `sendStyleboard` when `styleboardsSent` hits `Plan.luxMilestoneLookNumber`.
- **Stripe Connect (Phase 6):** `src/lib/stripe-connect.ts` wraps `stripe.accounts`, `stripe.accountLinks`, `stripe.transfers` separately from `src/lib/stripe.ts` so Connect calls are mockable in isolation. `accountIsPayoutReady(account)` is the predicate the `account.updated` webhook uses to flip `StylistProfile.payoutsEnabled`. Onboarding routes live at `/api/stylist/onboarding/connect/{start,return}`.
- **Stylist onboarding (Phase 6):** `src/lib/stylists/onboarding.ts` owns the 12-step wizard — `stepSchemas` (Zod), `saveStep`, `advance`, `resume`, `syncOnboardingMetadata` (writes `onboardingStatus` into Clerk `publicMetadata` so the edge proxy doesn't hit Postgres on every request). `src/components/stylist/onboarding-shell.tsx` is the client-side shell (forked from quiz-shell — quiz-shell's single-submit semantics don't fit per-step persistence). IN_HOUSE stylists skip step 12 (Stripe Connect) and advance straight to `AWAITING_ELIGIBILITY` after step 11. Profile boards (step 5) use `src/lib/boards/profile-boards.service.ts` with `sessionId=null` + `stylistProfileId=<self>` + `isFeaturedOnProfile=true` — min 3 / max 10 per claimed style.
- **Proxy onboarding gate (Phase 6):** `src/proxy.ts` redirects stylists mid-wizard away from `/stylist/*` to `/onboarding/[step]` unless `onboardingStatus ∈ {AWAITING_ELIGIBILITY, ELIGIBLE}`. API routes under `/api/stylist/*` return a JSON 403 instead of a redirect so fetch clients don't parse HTML. The wizard's own routes + profile-boards + uploads are exempt so the wizard can call back into itself. E2E mode short-circuits the gate via the existing `E2E_CLERK_ID_COOKIE` early-return.
- **Tip flow (Phase 6):** `/sessions/[id]/end-session` client component uses `@stripe/stripe-js` + `@stripe/react-stripe-js` `PaymentElement`. Server Action `submitEndSessionFeedback` rejects replays when `session.rating` is already set, creates the Stripe PaymentIntent (with `idempotencyKey = tip_<sessionId>`) *before* writing rating/review, then transitions the session. The durable write for `Session.tipInCents` + `Payment(type=TIP)` happens in the `payment_intent.succeeded` webhook — the Server Action is optimistic.
- **Commerce extras (Phase 9 preflight):** 7 new models land the commerce surface that wraps the session loop — `LoyaltyAccount` (userId unique, denormalized `User.loyaltyTier` stays as a fast-read cache; service writes both atomically), `PromoCode` (with `creditType` = SESSION or SHOPPING, optional `stripeCouponId` for Stripe-synced session coupons), `GiftCard` (dual FK to PromoCode — `sessionPromoCodeId` + `shoppingPromoCodeId` are unique so each gift-card purchase issues exactly two codes), `ReferralCredit` (`referredUserId` unique — one credit per referred user), `CartItem` (denormalized `sessionId` at add time so StylingRoom Cart can filter to session products; unique on `[userId, inventoryProductId, sessionId]`), `Collection` + `CollectionItem` (closet Collections UI with preview grid). Order model extends for direct-sale fulfillment: `taxInCents`, `shippingInCents`, `isPriorityShipping` (Lux), `trackingNumber`, `carrier`, shipping-address snapshot fields, returns/refund timestamps, and a unique `stripeCheckoutSessionId` for idempotent direct-sale webhook handling. `OrderStatus` extended with `ORDERED`, `SHIPPED`, `RETURN_IN_PROCESS` — direct-sale uses `ORDERED → SHIPPED → ARRIVED → RETURN_IN_PROCESS → RETURNED`; affiliate orders keep using `PENDING → ARRIVED`. `lib/plans.ts` now exposes `getPlanPricesForUi()` as the single source of truth for client-side prices — never hardcode plan prices in JSX (the Loveable port has three hardcoded-price bugs that are fixed at port time by reading this helper). Feed page (`Board.profileGender`) was cut from Phase 9 scope.
- **Loyalty (Phase 9b):** `src/lib/loyalty/service.ts` owns `recomputeForUser(userId, { tx? })` — writes both `LoyaltyAccount` (canonical) and `User.loyaltyTier` (denormalized cache) from a single `Session.COMPLETED` count. Tiers: BRONZE 0-2, GOLD 3-7, PLATINUM 8+. Hooked into `sessions/transitions.ts::approveEnd` inside the same transaction that flips the session — atomic with the completion. The `loyalty-recalc` worker runs monthly (cron(0 0 1 * ? *)) as a defensive full-scan recompute for both loyalty tiers AND `StylistProfile.averageRating` (aggregated across `StylistReview.rating` + `Session.rating`). Built with set-based `groupBy` aggregation + bounded concurrency so it scales with active-user count, not total-user count. Register new schedulers under `infra/modules/scheduler/main.tf` (three now: waitlist-notify, payout-reconcile, loyalty-recalc).
- **Promotions (Phase 9b):** `src/lib/promotions/` owns the three coupon-adjacent services. `referral.service.ts::issueReferralCreditIfFirstCompletion` fires from `approveEnd` when `User.referredByUserId` is set and this is the user's first `COMPLETED` session — race-safe via a P2002 catch on `ReferralCredit.referredUserId @unique` so a concurrent completion doesn't abort the surrounding approveEnd transaction. `REFERRAL_CREDIT_IN_CENTS` = $20. `claimCredit(userId, maxCents, tx)` is what checkout calls: consumes unredeemed credits oldest-first, one-phase (marks `redeemedAt` when claimed), stops before overfilling `maxCents`. `gift-card.service.ts::createGiftCardCheckout` spins up a Stripe Checkout (`mode=payment`, `metadata.purpose=GIFT_CARD_PURCHASE`); on webhook fulfillment `applyGiftCardPurchaseFromCheckout` atomically creates 2× `PromoCode` rows (SESSION + SHOPPING, both `usageLimit=1`) + 1× `GiftCard` + `Payment(type=GIFT_CARD_PURCHASE)`. Idempotency is P2002-guarded on `Payment.stripePaymentIntentId` so concurrent Stripe replays can't double-fulfill. `redeemPromoCode(code, creditType, tx)` increments `usedCount` atomically via `updateMany` guard so concurrent redemptions of a `usageLimit=1` code can't oversubscribe. `promo-code.service.ts` owns admin CRUD — SESSION-type codes mirror into Stripe via `stripe.coupons.create` with `amount_off` + `max_redemptions` (from `usageLimit`) + `redeem_by` (from `expiresAt`), so an expired or exhausted Wishi code can't still redeem at Stripe Checkout; SHOPPING-type codes are Wishi-local and only consumed by our checkout. Deactivation deletes the Stripe Coupon (Stripe doesn't support pausing) and writes `promo_code.deactivate` audit. Webhook routing in `webhook-handlers.ts` now switches on `metadata.purpose ∈ { UPGRADE | BUY_MORE_LOOKS | DIRECT_SALE | GIFT_CARD_PURCHASE | default-booking }`.
- **Direct-sale commerce (Phase 9c):** `src/lib/cart/cart.service.ts` owns the session-scoped cart (upsert on `[userId, inventoryProductId, sessionId]` — re-adds increment quantity; only products flagged `MerchandisedProduct.isDirectSale=true` are addable). `src/lib/payments/direct-sale.service.ts` creates Stripe Checkout sessions with `automatic_tax.enabled=true` (Stripe Tax is the only tax authority — we never recompute) and a fixed shipping rate (standard $10 or $0 for active Lux sessions). The checkout pre-creates `Order(status=PENDING)` carrying the cart snapshot; the webhook flips PENDING → ORDERED via conditional `updateMany` keyed on `Order.stripeCheckoutSessionId` — sidesteps Stripe's 500-char metadata limit and findUnique→create races on redelivery. `purpose=DIRECT_SALE` is the metadata discriminator on `checkout.session.completed`. `src/lib/orders/admin-orders.service.ts` owns the direct-sale fulfillment state machine (`ORDERED → SHIPPED → ARRIVED → RETURN_IN_PROCESS → RETURNED`); the `ARRIVED` transition is the single trigger that fires `closet/auto-create.ts` to materialize ClosetItems — Orders and Closet are separate pages, auto-create is the one-way edge. `src/lib/orders/client-orders.service.ts` implements the 14-day return window via conditional `updateMany`; admin refunds wrap Stripe `refunds.create` with an `idempotencyKey` keyed on `(orderId, prevRefundedInCents, amountInCents)` so concurrent admin clicks dedupe and soft-warn above a $200 cap. Both `createDirectSaleCheckout` and `refundOrder` accept optional `deps` test seams (matching the `payout-dispatch.service.ts` `deps.createTransfer` pattern) so integration tests run without live Stripe keys. The manual closet upload path in `lib/boards/closet.service.ts` must NEVER accept `sourceOrderItemId` — that field is reserved for `closet/auto-create.ts` and admin tooling.
- **Closet collections + social (Phase 9d):** `src/lib/collections/collection.service.ts` owns Collection CRUD + `CollectionItem` membership; ownership of `closetItemId`s is re-verified inside the service so a malicious caller can't seed a collection with someone else's rows. `validateCollectionName` is a pure exported helper so the validator is unit-tested without a DB. Closet page is now tab-based (Items / Looks / Collections) — filter facets (Designer, Season, Color, Category) are derived from the user's actual items, not a static taxonomy. The Items "Add" dialog calls existing `POST /api/closet/from-url` for the Web Upload path (handles both 201 and 202-partial responses). `src/lib/stylists/favorite-stylist.service.ts` and `src/lib/stylists/review.service.ts` back the new `/api/favorites/stylists` + `/api/stylists/[id]/reviews` route groups. Reviews come from two sources: explicit `StylistReview` rows AND `Session.reviewText` written at end-session — `listStylistReviews` aggregates both with explicit-overrides-session per-user de-dup, and `recomputeAverageRating` runs the same dedup so the cached `StylistProfile.averageRating` matches the visible list. `POST /api/stylists/[id]/reviews` returns 403 if the user has zero `Session.COMPLETED` with this stylist (route gate); the service re-checks as defense-in-depth. `validateReviewInput` (1–5 integer rating, 5–5000 char text) is exported for direct unit testing.

## Build phase progress

- [x] Phase 0: AWS Foundation (ECS, RDS, ALB, S3, CI/CD)
- [x] Phase 1: Authentication & User Management
- [x] Phase 2: Quizzes, Booking & Payments
- [x] Phase 3: Real-Time Chat
- [x] Phase 4: Moodboards & Styleboards
- [x] Phase 5: Inventory Integration & Click-Through Tracking
- [x] Phase 6: Stylist Dashboard & Payouts
- [ ] Phase 7: AI Features
- [x] Phase 8: Admin Panel
- [x] Phase 9: Commerce Extras (9a billing PR#23, 9b loyalty/promo PR#27, 9c direct-sale PR#26, 9d closet/social PR#25, 9e end-session/match-score PR#24)
- [~] Phase 10: Client App Frontend Port — `client-frontend-port` (PR#30), code-complete. Foundation + all public marketing pages (`/`, `/pricing`, `/how-it-works`, `/lux`, `/stylists`, `/stylists/[id]`, `/feed`, `not-found.tsx`) + all authed pages (`(client)/sessions`, `settings`, `favorites`, `cart` with two-track Wishi + retailer UI, `matches`, `orders`, `closet`, `sessions/[id]/end-session`, `sessions/[id]/chat` = StylingRoom) + all shared dialogs (UpgradePlanDialog, CancelMembershipDialog, BuyLooksDialog, RestyleWizard, MoodBoardWizard, MoodBoardDialog, StyleBoardDialog, ProductDetailDialog, ClosetItemDialog) + Motion library `Reveal` + Playwright visual-regression harness (`npm run test:visual`) landed. StylingRoom ships Cart tab filtered to session CartItems, right-rail SessionSidebar (plan-progress, BuyLooks CTA, Upgrade deep-link), and Phase-7-forward Suggested Replies chip row gated on `NEXT_PUBLIC_FEATURE_AI_SUGGESTED_REPLIES`. Verified: dev server boots clean, all 6 marketing routes return 200, full repo `npx tsc --noEmit` is 0 errors, `npm test` is 248/279 passing / 31 intentionally skipped / 0 failing, 12 visual-regression baselines captured (6 routes × 2 viewports) and replay-stable. The authed "top matches" view lives at `/matches` since `/(client)/stylists` collided with the public `/stylists` directory. `shadcn add form` deferred — base-nova registry does not ship a form component and no Phase 10 page uses one.
- [ ] Phase 11: Polish & Launch

## Staging

- **ALB:** `http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com`
- **Health:** `/api/health` → `{ ok: true, db: "up" }`
- **AWS account:** 815935788935, region us-east-1
- **DNS/HTTPS/CloudFront:** Deferred — wishi.me Route 53 zone is in the old AWS account

## Running locally

```bash
cp .env.example .env
# Fill in DATABASE_URL pointing to a local Postgres
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```
