@AGENTS.md

# Wishi Platform — Client Web App

## What is this

Wishi is a styling marketplace. This repo is the Next.js 16 monolith (client, stylist, and admin route groups) deployed on AWS ECS Fargate.

## How we work — read this before anything else

This section is the orientation for a fresh agent. It exists because agents keep rediscovering things we already solved, or claiming they "can't" do something they can. Before doing research or declaring a limitation, check this block.

### You CAN verify your work. Don't deflect.

Tasks like "manual browser QA", "confirm visual fidelity", "test prefers-reduced-motion", "check a price renders correctly", "scrape the rendered DOM", "verify a flow works authed" are all automatable in this repo. Playwright + the systems below already cover them. If you're about to say "I can't drive a browser" or "I can't do manual QA", stop — you almost certainly can, with one of the tools below.

**Verification stack, ordered by cost:**

1. **`npm run typecheck`** — `tsc --noEmit`. Runs in seconds. Run before every commit.
2. **`npm run lint`** — ESLint. Runs in seconds.
3. **`npm test`** — unit + Prisma-integration suite via `node --test`. ~25s. Existing target: 248+ passing, 0 failing, 31 intentionally skipped (live-Stripe + CI-harness deferrals).
4. **`npm run test:visual`** — Playwright visual regression against committed baselines. Config: `playwright.visual.config.ts`. Two projects: `desktop-chrome` (1280×800) + `mobile-chrome` (Pixel 7). Baselines under `tests/visual/marketing.spec.ts-snapshots/` with per-platform suffix (`-darwin`, `-linux`). `npm run test:visual:update` regenerates. 0.5% delta budget.
5. **`npm run e2e`** — Playwright against `npm run start:e2e` on port 3001 with `E2E_AUTH_MODE=true`. Uses `tests/e2e/global-setup.js` to seed Plans + Quiz tables first. Some tests fail in local environments that lack Twilio / S3 / fresh Clerk rate-limit headroom; CI (nightly) runs it with full env. These failures are NOT blockers for PR merge — the PR CI runs only 1–3 above.
6. **Dev-server probe** — `npm run dev` boots the app. `curl http://localhost:3000/<route>` checks HTTP status. Useful when you've made a route-level change and want a fast "does it still boot" check before running visual tests.

### Playwright capabilities you likely have

These are first-class and already work. Don't write them off as "requires manual":

- **Viewport emulation** — `await browser.newContext({ viewport: { width, height } })`. Already covered at 1280×800 + 375×812 in the visual-regression projects.
- **`prefers-reduced-motion`** — `await browser.newContext({ reducedMotion: "reduce" })`. Used by `tests/visual/phase10-verify.spec.ts` to confirm the `Reveal` primitive skips animations.
- **Dark mode / colour schemes** — `colorScheme: "dark"` on the same context.
- **Geolocation / timezone / locale** — all on the context.
- **Console-error capture** — `page.on("pageerror", ...)` + `page.on("console", ...)` to surface JS errors that visual diffs miss.
- **DOM scraping** — `page.locator("body").innerText()` + string asserts are the right move for "does this price render?" style questions. Don't try to set up a fixture unless the DOM check is insufficient.
- **Network interception / stubbing** — `page.route("**/api/...", ...)` when you want to test UI without hitting real services.

### Running tests as an authed user — `E2E_AUTH_MODE`

The app has a built-in e2e auth backdoor. **Do not try to automate Clerk's OAuth flow** (it won't work headlessly, and you'll rate-limit the dev tenant).

- **Enable:** `npm run dev:e2e` or `npm run start:e2e` sets `E2E_AUTH_MODE=true` and port `3001`.
- **Sign-in:** The `/sign-in` page renders a plain email form when the flag is on. POST the form with any `@e2e.wishi.test` email — the server-side action `signInForE2E` looks up the user by email and sets an `E2E_CLERK_ID_COOKIE`. No password. See `src/app/sign-in/[[...sign-in]]/actions.ts`.
- **Seed users inline from specs:** `tests/e2e/db.ts` exports `ensureClientUser`, `ensureStylistUser`, `createSessionForClient`, `cleanupE2EUserByEmail`, `getPool`. For anything not already covered, raw `pg` queries are the expected path — see `tests/e2e/phase10-authed.spec.ts` for the subscription-seed pattern.
- **Email domain gate:** only `@e2e.wishi.test` emails can sign in via the backdoor (enforced by the server action). Use `` `phase10-<thing>-${Date.now()}@e2e.wishi.test` `` to avoid collisions.
- **Cleanup:** always wrap fixture creation in `try/finally` with `cleanupE2EUserByEmail(email)` — the helper deletes cross-entity rows in FK-safe order.
- **Proxy onboarding gate:** stylists mid-onboarding get redirected away from `/stylist/*`. The gate short-circuits when `E2E_CLERK_ID_COOKIE` is set, so e2e specs aren't trapped in the wizard.

### Price correctness — single source of truth

Never hardcode plan prices (Mini, Major, Lux, additional looks) in JSX. They live in the `Plan` table, surfaced to UI via `src/lib/plans.ts#getPlanPricesForUi()`. Marketing-copy bullet lists (no prices) live in `src/lib/ui/plan-copy.ts`.

**Grep gate** (run before any price-touching PR):
```bash
rg -n '"\$60|"\$130|"\$550|"\$20|6000|13000|55000|2000' src/ \
  -g '!lib/plans.ts' -g '!lib/ui/plan-copy.ts' \
  -g '!**/*.test.*' -g '!**/*.md'
```
The Loveable port had three hardcoded-price bugs (`$70` Major, `$490` Lux, `$54` Mini). Any new port must pass this grep.

### Definition of done for a PR

Before pushing, every PR should have:

- [x] Typecheck clean
- [x] Lint clean
- [x] Unit tests pass with no new failures
- [x] Visual regression passes (or baselines intentionally updated + committed)
- [x] At least one targeted spec for any new user-facing behaviour — inline DOM scrape, not "I'll verify manually"
- [x] Price grep gate passes (if JSX changed)
- [x] Docs updated (see "Docs to keep in sync" below)
- [x] Copilot (or any) PR review comments addressed before requesting merge

### Docs to keep in sync after each phase

A phase PR is not done until every doc below reflects the new reality. The auto-memory rule tracks some of this too, but CLAUDE.md is the canonical in-repo reference.

- `CLAUDE.md` — conventions block + `## Build phase progress` (flip `[~]` → `[x]` with merge SHA on merge)
- `README.md` — new env vars, new npm scripts, new dev commands
- `WISHI-REBUILD-PLAN.md` (in `wishi-style/` parent dir) — verification checkboxes updated with evidence per item
- `.env.example` — new env vars, with sane defaults
- `project_wishi_phase_progress.md` auto-memory — move completed phase from "in progress" to "done", capture deferred items
- Notion Roadmap — flip each completed roadmap item to `Status=Done` via the `notion` CLI (see `reference_notion_roadmap.md` memory for the database ID + commands). This is agent-owned, not user-owned.

### Branch + PR workflow

- **Branches:** no phase prefixes. Use standard production-style names (`client-frontend-port`, not `phase-10-client-port`).
- **"Vamos":** when Matt says "vamos", commit + push + open a PR. No questions.
- **Phase PRs are one branch, one PR.** Land foundation commits first, then pages, then dialogs. PR stays open while incremental work lands — don't split a phase into multiple PRs unless instructed.
- **Parallel phases need worktrees:** `git worktree add ../wishi-app-phaseN -b <branch>`. Symlink `node_modules` + `.env` from the root checkout. Prisma generate is per-worktree.
- **Commit messages:** subject-line scope prefix (`feat(frontend)`, `fix(cart)`, `docs`, `test`, etc.) + imperative mood. Body explains *why*, not *what*. Every commit co-authored with the model.

### Common pitfalls that have burned us

Things that have blocked work in the past. If you hit one, the fix is usually in this list.

- **Route-group collision** — Route groups like `(client)` and `(stylist)` don't add to the URL. `/(client)/stylists/page.tsx` and `/stylists/page.tsx` both resolve to `/stylists`. Next 16 refuses to boot with a parallel-pages error. Rename one of them (e.g. `/matches`).
- **Prisma regen per worktree** — A fresh worktree doesn't have `src/generated/prisma/` until you run `npx prisma generate`. Without it you'll see 200+ TS errors like "Cannot find module '@/generated/prisma/client'". Run prisma generate first, always.
- **Visual baseline platform suffix** — Baselines are per-OS (`-darwin`, `-linux`). When you update a baseline on macOS it doesn't cover Linux CI. If a visual test passes locally but fails in CI, the baseline is missing for the CI platform — either run in Docker with `-linux` or update both.
- **Lucide 1.x icon renames** — Every icon requires the `*Icon` suffix (`PlusIcon`, not `Plus`). Brand glyphs (Instagram, Facebook, Twitter) were dropped — inline SVGs.
- **Clerk v7 breaking changes** — `SignedIn` / `SignedOut` components are gone. Use `auth()` from `@clerk/nextjs/server` in Server Components with conditional rendering. `UserButton` from `@clerk/nextjs` still works for authed avatar UI.
- **Base-UI accordion** — `type="single" collapsible` are Radix-only props. Base-UI accordion is single-open by default; drop those props.
- **Tailwind v4 tokens** — Colours in `globals.css` sit under `@theme inline` as `hsl(...)` values. No `tailwind.config.ts` file. Extended palette names (`cream`, `warm-beige`, `taupe`, `dark-taupe`, `teal`, `burgundy`) are already wired.
- **shadcn `base-nova` registry gaps** — Some components (notably `form`) ship an empty JSON stub in the base-nova preset. `shadcn add form` will hang at "Checking registry" because the resolve returns nothing. Either write the component by hand from the `default` preset source, or skip if no page needs it.
- **Stripe / Twilio / S3 in local e2e** — Some existing e2e tests (`chat.spec.ts`, `boards.spec.ts`, `end-session.spec.ts`) fail locally because they need live Twilio / S3 / Stripe CLI. They run green in the nightly workflow. Don't treat them as regressions unless your change actually touched those code paths.
- **Clerk dev rate limits** — Tests that create many users in quick succession can hit `too_many_requests` on the shared Clerk dev tenant. Space them out or use `Date.now()` + a random suffix.
- **`unused-vars` on React event handlers** — ESLint flags `(_e: MouseEvent) => ...`. Drop the param if unused.

### Post-merge cleanup is yours, not the user's

When a phase/feature PR lands on `main`, the cleanup below is the agent's responsibility. Do **not** list these as "user-owned TODOs" — you have the tools, just do them. Coming off a worktree to do cleanup in the main checkout is a normal move, not a blocker.

- **Merge PRs yourself** — `gh pr merge <num> --repo wishi-style/wishi-app --squash --delete-branch`. If the user says "merge it" (or a PR is already approved + green), drive the rest of the cleanup too.
- **Come off the worktree** — `cd /Users/matthewcardozo/Wishi/wishi-style/wishi-app`. Bash cwd persists across Bash calls in this runtime, so one `cd` covers the rest of the session.
- **Fast-forward main** — `git fetch origin --prune && git checkout main && git pull --ff-only origin main`.
- **Remove the phase worktree** — `git worktree remove <name>` from the main worktree (you can't remove a worktree from inside it).
- **Delete stale local branches** — `git branch -D <phase-branch> <any-child-branches>`. Remote deletion happens automatically with `--delete-branch` on merge + `delete_branch_on_merge=true` on the repo.
- **Regenerate Prisma client** — `npx prisma generate` in the main worktree after a long-lived branch lands (schema may have shifted).
- **Toggle repo settings via `gh api`** — e.g. `gh api --method PATCH /repos/wishi-style/wishi-app -f delete_branch_on_merge=true`. Anything exposed in GitHub's Settings UI is reachable this way; don't ask the user to click through.
- **Update the Notion Roadmap** — the `notion` CLI is installed (`/opt/homebrew/bin/notion`, token already configured). The roadmap DB ID + command patterns live in the `reference_notion_roadmap.md` auto-memory. Example: `notion db query <db-id> --filter-prop Category --filter-type equals --filter-value Frontend --filter-prop-type select --llm` to list items, then `notion page update <page-id> --prop "Status=Done"` per item. Don't flag Notion as user-owned.
- **Docs follow-up PR** — after cleanup, update every doc in "Docs to keep in sync" on a small branch (`docs/<topic>`) + PR. Flip status markers, capture merge SHAs, update auto-memory. Don't leave this dangling.

**What's actually user-owned and why:**

- **Paths outside the repo tree** — the sandbox blocks `ls` / `rm` / `cat` outside `wishi-style/`. Stray typos or system-level dirs (e.g. an accidental `~/the-wishi-style`) must be deleted by the user.
- **Anything the user has explicitly claimed** — e.g. a Stripe product migration they said they'd run, an AWS console action, a domain DNS change.

**Before flagging anything as user-owned, check your auto-memory.** If a `reference_*.md` file has the database ID / command / token for the thing you're about to defer, you have access. Past-me was wrong to flag Notion as user-owned even though `reference_notion_roadmap.md` literally contained the CLI commands. Check memory first, then defer.

### When building a new user-facing surface, do this

1. Start the dev server (`npm run dev` — DO NOT add sleep/delay before starting; just run it).
2. Hit the route with `curl -sI http://localhost:3000/<route>` to confirm it returns 200.
3. Screenshot it via `page.screenshot()` in a throwaway Playwright test if you want to see what actually rendered.
4. If you changed a price or copy string, grep for it after — don't assume it rendered as you wrote it.
5. Write a targeted verify spec before calling the task done. Test plans with "[ ] manual QA" items are a code smell — replace each with an automated check.

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
- [x] Phase 10: Client App Frontend Port — PR#30 merged 2026-04-22 (`bf022e7`). Foundation + all public marketing pages (`/`, `/pricing`, `/how-it-works`, `/lux`, `/stylists`, `/stylists/[id]`, `/feed`, `not-found.tsx`) + all authed pages (`(client)/sessions`, `settings`, `favorites`, `cart` with two-track Wishi + retailer UI, `matches`, `orders`, `closet`, `sessions/[id]/end-session`, `sessions/[id]/chat` = StylingRoom) + all shared dialogs (UpgradePlanDialog, CancelMembershipDialog, BuyLooksDialog, RestyleWizard, MoodBoardWizard, MoodBoardDialog, StyleBoardDialog, ProductDetailDialog, ClosetItemDialog) + Motion library `Reveal` + Playwright visual-regression harness (`npm run test:visual`) landed. StylingRoom ships Cart tab filtered to session CartItems, right-rail SessionSidebar (plan-progress, BuyLooks CTA, Upgrade deep-link), and Phase-7-forward Suggested Replies chip row gated on `NEXT_PUBLIC_FEATURE_AI_SUGGESTED_REPLIES`. Verified: dev server boots clean, all 6 marketing routes return 200, full repo `npx tsc --noEmit` is 0 errors, `npm test` is 248/279 passing / 31 intentionally skipped / 0 failing, 12 visual-regression baselines captured (6 routes × 2 viewports) and replay-stable. The authed "top matches" view lives at `/matches` since `/(client)/stylists` collided with the public `/stylists` directory. `shadcn add form` deferred — base-nova registry does not ship a form component and no Phase 10 page uses one.
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
