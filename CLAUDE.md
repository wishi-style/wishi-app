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
│   ├── schema.prisma      30 models, 26 enums
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
- **Deferred relations:** Some Prisma relations are deferred to future phases. Session.promoCodeId, Payment.giftCardId/promoCodeId are plain String? fields (no FK). (Phase 5 resolved `Session.orders` and `Session.affiliateClicks`.)
- **Boards (Phase 4):** Polymorphic `Board` (`type = MOODBOARD | STYLEBOARD`). `BoardItem.source` = `INVENTORY | CLOSET | INSPIRATION_PHOTO | WEB_ADDED` with a raw-SQL CHECK constraint enforcing exactly one source field is populated. Restyles live as `Board(type=STYLEBOARD, isRevision=true, parentBoardId=<original>)`. Profile boards (used in Phase 6 stylist onboarding) are `Board(sessionId=null, stylistProfileId=<self>, isFeaturedOnProfile=true, profileStyle=<style>)`. **After running `npx prisma migrate dev --name phase4_boards`, apply `prisma/migrations/phase4_constraints.sql` by hand** (Prisma can't express the polymorphism CHECK or the partial unique indexes on `favorite_items`).
- **Pending actions:** `src/lib/pending-actions/` exposes `openAction(sessionId, type, opts)` / `resolveAction(sessionId, type, opts)` / `expireAction(id)`. Default `dueAt` offsets (24h/48h/72h/6h) live in `policy.ts` so they can be tuned without a schema change. Every state-transition in `src/lib/sessions/transitions.ts` and `src/lib/boards/*.service.ts` rolls actions atomically in a transaction.
- **Admin (Phase 8):** `(admin)` route group uses `requireAdmin()` (resolves Prisma user + `act` claim detection). Every admin mutation writes an `AuditLog` row via `writeAudit({ actorUserId, action, entityType, entityId, meta })` from `src/lib/audit/log.ts`. Session/subscription override predicates live in `src/lib/services/admin-guards.ts` as pure functions for testability. Impersonation uses Clerk actor tokens (`clerkClient().actorTokens.create`) → the `act` claim on the impersonated session is detected by `ImpersonationBannerMount` in the root layout and by `assertNotImpersonating()` for destructive-action guards. Quiz builder rewrites all `QuizQuestion` rows in a single transaction using a two-pass `sortOrder` offset (temp 100000+i then target i) to avoid `(quizId, sortOrder)` unique-constraint conflicts.
- **Session transitions:** `src/lib/sessions/transitions.ts` owns `activateSession`, `requestEnd`, `approveEnd`, `declineEnd`, `freezeSession`, `unfreezeSession`, `detectPendingEnd`. Each mutation (a) updates the session, (b) writes a SYSTEM_AUTOMATED chat message via `sendSystemMessage`, (c) rolls pending actions, (d) fan-outs notifications via `lib/notifications/dispatcher.ts`.
- **Inventory service:** Wishi does NOT store product data locally. `src/lib/inventory/inventory-client.ts` proxies the tastegraph inventory service (`INVENTORY_SERVICE_URL`). 5-minute in-process cache; returns empty arrays on failure so the board builder's Inventory tab degrades gracefully. `inventoryProductId` stored on `BoardItem` / `Message.singleItemInventoryProductId` / `FavoriteItem` is a plain string — resolve it via `/api/products/[id]` at render time.
- **Sending boards through chat:** Board helpers use Twilio REST with `xTwilioWebhookEnabled="true"` so the webhook handler persists the `Message` row with `kind = MOODBOARD|STYLEBOARD|RESTYLE` + `boardId` attribute. `src/lib/chat/send-message.ts` centralizes the Twilio call; don't call `twilioClient.conversations...messages.create` directly from service code.
- **Prisma JSON fields:** Use `as Prisma.InputJsonValue` when passing `Record<string, unknown>` to JSON columns — Prisma's strict types reject plain Records.
- **Seeding:** `npx prisma db seed` or `npx tsx prisma/seed.ts` with DATABASE_URL set. Seeds are idempotent (upserts).
- **Workers (Phase 5):** Scheduled background jobs live under `src/workers/`. `entry.ts` reads `process.env.WORKER` and dispatches to a handler. One shared ECS task definition (`docker/Dockerfile.worker`) is invoked by four `aws_scheduler_schedule` rules in `infra/modules/workers` — the scheduler passes `WORKER=<name>` via `containerOverrides`. Handlers: `affiliate-ingest` (daily), `affiliate-prompt` (15m), `pending-action-expiry` (15m, owns `session.overdue` notification emission — Phase 6's dashboard only reads the already-flipped `SessionPendingAction.status = EXPIRED`), `stale-cleanup` (daily). Admin UI can fire any worker manually via `POST /api/admin/workers/[name]/run` for staging verification.
- **Affiliate tracking (Phase 5):** Click-through commerce lives in `src/lib/affiliate/`, `src/lib/orders/`, `src/lib/closet/`. A client click on a product writes an `AffiliateClick`. 24h later the `affiliate-prompt` worker fires `affiliate.purchase_check`; the user replies "yes" via `POST /api/affiliate/self-report`, which creates `Order(SELF_REPORTED)` + `OrderItem` and auto-creates `ClosetItem` rows. Nightly, `affiliate-ingest` polls `/internal/commissions` and either upgrades that order to `AFFILIATE_CONFIRMED` (dedup branch B) or creates a fresh confirmed order (branch C). `ClosetItem.sourceOrderItemId` links each closet entry back to its Order. `POST /api/closet/from-url` is inline (not a worker) — parses Open Graph and uploads to S3 in the request.

## Build phase progress

- [x] Phase 0: AWS Foundation (ECS, RDS, ALB, S3, CI/CD)
- [x] Phase 1: Authentication & User Management
- [x] Phase 2: Quizzes, Booking & Payments
- [x] Phase 3: Real-Time Chat
- [x] Phase 4: Moodboards & Styleboards
- [x] Phase 5: Inventory Integration & Click-Through Tracking
- [ ] Phase 6: Stylist Dashboard & Payouts
- [ ] Phase 7: AI Features
- [x] Phase 8: Admin Panel
- [ ] Phase 9: Commerce Extras
- [ ] Phase 10: Client App Frontend Port
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
