@AGENTS.md

# Wishi Platform — Client Web App

Wishi is a styling marketplace. This repo is the Next.js 16 monolith (client, stylist, and admin route groups) deployed on AWS ECS Fargate.

## How we work — read this before anything else

This block exists because agents keep rediscovering things we already solved or claiming they "can't" do something they can. Before doing research or declaring a limitation, check this section.

### You CAN verify your work. Don't deflect.

Tasks like "manual browser QA", "confirm visual fidelity", "test prefers-reduced-motion", "check a price renders correctly", "scrape the rendered DOM", "verify a flow works authed" are all automatable in this repo. Playwright + the systems below cover them. If you're about to say "I can't drive a browser" or "I can't do manual QA", stop — you almost certainly can with one of the tools below.

**Verification stack, ordered by cost:**

1. **`npm run typecheck`** — `tsc --noEmit`. Seconds. Run before every commit.
2. **`npm run lint`** — ESLint. Seconds.
3. **`npm test`** — unit + Prisma-integration suite via `node --test`. ~25s. ~290 passing, 0 failing, ~39 intentionally skipped (live-Stripe + CI-harness deferrals). The skipped count creeps up over time; track new failures, not the absolute number.
4. **`npm run test:visual`** — Playwright visual regression against committed baselines (anonymous marketing routes). Config: `playwright.visual.config.ts`. Two projects: `desktop-chrome` (1280×800) + `mobile-chrome` (Pixel 7). Baselines under `tests/visual/marketing.spec.ts-snapshots/` with per-platform suffix (`-darwin`, `-linux`). `npm run test:visual:update` regenerates. 0.5% delta budget. Sibling configs `playwright.visual-stylist.config.ts` (`npm run test:visual:stylist`) and `playwright.visual-client.config.ts` (`npm run test:visual:client`) cover authed surfaces — local-only because they need DB seeding. The `.github/workflows/visual-regression.yml` workflow is **manual-only** (`workflow_dispatch`); bootstrap linux baselines via `update_snapshots=true`, download the `linux-baselines` artifact, commit.
5. **`npm run e2e`** — Playwright against `npm run start:e2e` on port 3001 with `E2E_AUTH_MODE=true`. Uses `tests/e2e/global-setup.js` to seed Plans + Quiz tables. Some tests fail in local environments without Twilio / S3 / fresh Clerk rate-limit headroom; the `e2e-nightly.yml` workflow runs with the full staging-secret env wired through GH Actions secrets (mirrored from `wishi/staging/*` in AWS Secrets Manager — re-mirror by running the `mirror()` helper at the top of `.github/workflows/e2e-nightly.yml`'s history or by hand with `aws secretsmanager get-secret-value | gh secret set`). Those are NOT blockers for PR merge — PR CI runs only 1–3 above.
6. **Dev-server probe** — `npm run dev` boots the app. `curl http://localhost:3000/<route>` checks HTTP status. Useful for a fast "does it still boot" check before running visual tests.
7. **Full e2e walkthrough** — `scripts/e2e-full-walkthrough.ts` drives the golden path (seed users → Twilio conversation → moodboard + styleboard send + feedback → end session → rating → admin order transitions) against `dev:e2e` with staging integration keys, then polls Klaviyo / Stripe / Twilio read APIs and DB row counts to prove each layer fired. Run as `npm run dev:e2e & npx tsx --env-file=.env scripts/e2e-full-walkthrough.ts`. Use before opening staging to a new cohort or after any major merge.

### Playwright capabilities you likely have

These are first-class and already work. Don't write them off as "requires manual":

- **Viewport emulation** — `await browser.newContext({ viewport: { width, height } })`. Already covered at 1280×800 + 375×812 in the visual-regression projects.
- **`prefers-reduced-motion`** — `await browser.newContext({ reducedMotion: "reduce" })`. Used by `tests/visual/phase10-verify.spec.ts` to confirm the `Reveal` primitive skips animations.
- **Dark mode / colour schemes** — `colorScheme: "dark"` on the same context.
- **Geolocation / timezone / locale** — all on the context.
- **Console-error capture** — `page.on("pageerror", ...)` + `page.on("console", ...)` to surface JS errors that visual diffs miss.
- **DOM scraping** — `page.locator("body").innerText()` + string asserts are the right move for "does this price render?" style questions. Don't set up a fixture unless the DOM check is insufficient.
- **Network interception / stubbing** — `page.route("**/api/...", ...)` when you want to test UI without hitting real services.

### Running tests as an authed user — `E2E_AUTH_MODE`

The app has a built-in e2e auth backdoor. **Do not try to automate Clerk's OAuth flow** (it won't work headlessly, and you'll rate-limit the dev tenant).

- **Enable:** `npm run dev:e2e` or `npm run start:e2e` sets `E2E_AUTH_MODE=true` and port `3001`.
- **Sign-in:** `/sign-in?e2e=1` renders a plain email form when the flag is on. POST any `@e2e.wishi.test` email — the server-side action `signInForE2E` looks up the user by email and sets `E2E_CLERK_ID_COOKIE`. No password.
- **Server-side auth bridge:** Server Components and Server Actions that need to recognise the e2e cookie MUST call `getServerAuth()` from `src/lib/auth/server-auth.ts`, NOT Clerk's bare `auth()`. Plain `auth()` returns `userId=null` in E2E mode and silently falls through to guest paths. `/stylist-match/page.tsx` is the canonical example.
- **Seeding fixtures inline from specs:** `tests/e2e/db.ts` exports `ensureClientUser`, `ensureStylistUser`, `ensureStylistProfile`, `createSessionForClient`, `cleanupE2EUserByEmail`, `getPool`. For anything not covered, raw `pg` queries are the expected path.
- **Email domain gate:** only `@e2e.wishi.test` emails work via the backdoor (enforced by the server action). Use `` `<feature>-${Date.now()}-${Math.random().toString(36).slice(2,6)}@e2e.wishi.test` `` to avoid collisions.
- **Cleanup:** wrap fixture creation in try/finally with `cleanupE2EUserByEmail(email)` — the helper deletes cross-entity rows in FK-safe order.
- **Proxy onboarding gate:** stylists mid-onboarding get redirected away from `/stylist/*`. The gate short-circuits when `E2E_CLERK_ID_COOKIE` is set.

### Price correctness — single source of truth

Never hardcode plan prices (Mini, Major, Lux, additional looks) in JSX. They live in the `Plan` table, surfaced to UI via `src/lib/plans.ts#getPlanPricesForUi()`. Marketing-copy bullet lists (no prices) live in `src/lib/ui/plan-copy.ts`.

**Grep gate** (run before any price-touching PR):
```bash
rg -n '"\$60|"\$130|"\$550|"\$20|6000|13000|55000|2000' src/ \
  -g '!lib/plans.ts' -g '!lib/ui/plan-copy.ts' \
  -g '!**/*.test.*' -g '!**/*.md'
```
Loveable carries three hardcoded-price bugs (`$70` Major, `$490` Lux, `$54` Mini); any new port must keep them fixed.

### Definition of done for a PR

Before pushing, every PR has:

- [x] Typecheck clean
- [x] Lint clean
- [x] Unit tests pass with no new failures
- [x] **Playwright spec for every new user-facing behaviour.** Each new route, redirect, gate, CTA target, dialog, and server action gets at least one spec under `tests/e2e/<feature>.spec.ts`. **A PR description with any `[ ] Local: ...` or `[ ] Manual: ...` checkbox is not done — every line in the test plan must be an automated check that already passed.** Manual checkboxes rot; Playwright catches the regression.
- [x] Price grep gate passes (if JSX changed)
- [x] Docs updated (see "Docs to keep in sync" below)
- [x] Copilot (or any) PR review comments addressed before requesting merge

**Self-check before pushing:** open the PR body, search for `[ ]`. For every unchecked box, ask "Could this be a Playwright assertion?" If yes, write the spec before pushing. If you're declaring the PR ready while the test plan reads like a manual to-do list, you're not done.

### Docs to keep in sync

- `CLAUDE.md` — this file. Update Conventions / Locked decisions when those genuinely change. Don't add per-PR change-log entries here.
- `README.md` — new env vars, new npm scripts, new dev commands.
- `WISHI-LAUNCH-PREP.md` (in `wishi-style/` parent dir, untracked) — launch prep plan; Track A / B / C is the current source of "what's left before real users". The original rebuild plan is archived at `archive/WISHI-REBUILD-PLAN.md` for historical reference only — don't update it.
- `.env.example` — new env vars, with sane defaults.
- Notion Roadmap — flip each completed roadmap item to `Status=Done` via the `notion` CLI (DB ID + commands in `reference_notion_roadmap.md` auto-memory). Agent-owned, not user-owned.

### Branch + PR workflow

- **Branches:** no phase prefixes. Use standard production-style names (`client-frontend-port`, `match-quiz-mens-flow`).
- **"Vamos":** when Matt says "vamos", commit + push + open a PR. No questions.
- **One branch, one PR.** Land foundation commits first, then pages, then dialogs. PR stays open while incremental work lands — don't split a feature into multiple PRs unless instructed.
- **Parallel work needs worktrees:** `git worktree add ../wishi-app-<topic> -b <branch>`. Symlink `node_modules` + `.env` from the root checkout. Prisma generate is per-worktree.
- **Commit messages:** subject-line scope prefix (`feat(frontend)`, `fix(cart)`, `docs`, `test`, etc.) + imperative mood. Body explains *why*, not *what*. Co-author every commit with the model.

### Common pitfalls that have burned us

- **Route-group collision** — Route groups like `(client)` and `(stylist)` don't add to the URL. `/(client)/stylists/page.tsx` and `/stylists/page.tsx` both resolve to `/stylists` and Next 16 refuses to boot with a parallel-pages error. Rename one (e.g. `/matches`).
- **Dynamic segment without an index `page.tsx`** — If `foo/[id]/bar/page.tsx` exists but `foo/[id]/page.tsx` does not, the bare `/foo/{id}` path 404s. Next does not synthesize an index from children. Add an explicit `page.tsx` (a one-line `redirect()` to the primary child is fine).
- **Prisma regen per worktree** — A fresh worktree doesn't have `src/generated/prisma/` until you run `npx prisma generate`. Without it you'll see 200+ TS errors like "Cannot find module '@/generated/prisma/client'". Run prisma generate first.
- **Lucide 1.x icon renames** — Every icon requires the `*Icon` suffix (`PlusIcon`, not `Plus`). Brand glyphs (Instagram, Facebook, Twitter) were dropped — inline SVGs.
- **Clerk v7 breaking changes** — `SignedIn` / `SignedOut` components are gone. Use `auth()` from `@clerk/nextjs/server` in Server Components with conditional rendering. `UserButton` from `@clerk/nextjs` still works for authed avatar UI.
- **`auth()` vs `getServerAuth()`** — Clerk's bare `auth()` returns `userId=null` in `E2E_AUTH_MODE`. Any Server Component / Server Action that should treat e2e users as signed-in MUST use `getServerAuth()`.
- **Base-UI accordion** — `type="single" collapsible` are Radix-only props. Base-UI accordion is single-open by default; drop those props.
- **Tailwind v4 tokens** — Colours in `globals.css` sit under `@theme inline` as `hsl(...)` values. No `tailwind.config.ts` file. Extended palette names (`cream`, `warm-beige`, `taupe`, `dark-taupe`, `teal`, `burgundy`) are wired.
- **shadcn `base-nova` registry gaps** — Some components (notably `form`) ship an empty JSON stub. `shadcn add form` hangs at "Checking registry". Either write the component by hand from the `default` preset source, or skip if no page needs it.
- **Stripe / Twilio / S3 in local e2e** — Some existing e2e tests (`chat.spec.ts`, `boards.spec.ts`, `end-session.spec.ts`) fail locally because they need live Twilio / S3 / Stripe CLI. The `e2e-nightly.yml` workflow has those keys wired (mirrored from `wishi/staging/*` in AWS SM to GH Actions secrets). Don't treat them as regressions unless your change actually touched those code paths — but if the nightly is red, do investigate; it's a real signal again.
- **Clerk dev rate limits** — Tests that create many users in quick succession can hit `too_many_requests` on the shared dev tenant. Space them out or use `Date.now()` + a random suffix.
- **`unused-vars` on React event handlers** — ESLint flags `(_e: MouseEvent) => ...`. Drop the param if unused.
- **Next.js dev server "another instance running"** — Next 16 detects port collisions and refuses to start a second `next dev` *anywhere*, even on a different port. `pkill -f "next dev"` before starting a second instance.
- **Stale `.env.local`** — `next dev` reads `.env.local` over `.env`. Wrong hosts (e.g. a docker bridge IP that isn't routable on macOS) silently break DB connectivity. Check `.env.local` first when `/api/health` returns 503.
- **`User.email` is not strictly unique** — uniqueness is enforced by a partial unique index `users_email_active_unique ON users(email) WHERE deleted_at IS NULL`. The Prisma schema does NOT carry `@unique` on `email` (Prisma can't model partial uniques and would otherwise re-introduce the soft-delete-blocks-resignup bug). Always look up by email with `findFirst({ where: { email, deletedAt: null } })`, never `findUnique`. Anywhere that mutates `User.deletedAt` should also assume the same email may be reused later.
- **Stylist `onboardingStatus` lives in two places** — DB (`stylist_profiles.onboarding_status`) and Clerk (`publicMetadata.onboardingStatus`). The edge proxy reads Clerk to gate `/stylist/*` without a per-request DB hit. Anywhere DB writes the column must call `syncStylistOnboardingForUser(userId)` from `@/lib/auth/reconcile-clerk-user` so Clerk doesn't drift. Currently wired into the wizard's `advance()`, `approveStylistMatchEligibility`, `promoteToStylist`, the Stripe Connect return route, and the payout webhook. Add a new mutation site? Wire the sync.
- **Staging is HTTPS now** — Staging serves through CloudFront (`https://d2mt49xs07o9rr.cloudfront.net`) which terminates HTTPS at the edge using the default `*.cloudfront.net` cert and proxies to the existing HTTP ALB. This fixed a class of bugs where Clerk's `Secure`-flagged session cookies were skipped over HTTP — symptoms included the post-Stripe-checkout `/bookings/success` white page (CloudWatch said `Clerk: Refreshing the session token resulted in an infinite redirect loop. This usually means that your Clerk instance keys do not match`; the keys were fine, the cookies just weren't reaching the server) and a similar white page on `accounts.dev/sign-in` after a successful sign-up redirect. Don't link testers to the raw `wishi-staging-alb-...elb.amazonaws.com` URL anymore — the HTTP listener stays open for back-end webhook delivery, but every browser path should be the CloudFront URL.

### Post-merge cleanup is yours, not the user's

When a PR lands on `main`, the cleanup below is the agent's responsibility. Do **not** list these as "user-owned TODOs" — you have the tools.

- **Merge PRs yourself** — `gh pr merge <num> --repo wishi-style/wishi-app --squash --delete-branch`. If the user says "merge it" (or a PR is approved + green), drive the rest of the cleanup too.
- **Come off the worktree** — `cd /Users/matthewcardozo/Wishi/wishi-style/wishi-app`. Bash cwd persists across Bash calls; one `cd` covers the rest of the session.
- **Fast-forward main** — `git fetch origin --prune && git checkout main && git pull --ff-only origin main`.
- **Remove the feature worktree** — `git worktree remove <name>` from the main worktree.
- **Delete stale local branches** — `git branch -D <feature-branch> <any-child-branches>`. Remote deletion happens automatically with `--delete-branch` on merge + `delete_branch_on_merge=true` on the repo.
- **Regenerate Prisma client** — `npx prisma generate` in the main worktree after a long-lived branch lands (schema may have shifted).
- **Toggle repo settings via `gh api`** — e.g. `gh api --method PATCH /repos/wishi-style/wishi-app -f delete_branch_on_merge=true`. Anything in GitHub's Settings UI is reachable this way; don't ask the user to click through.
- **Update the Notion Roadmap** — the `notion` CLI is installed at `/opt/homebrew/bin/notion` with token configured. Roadmap DB ID + command patterns are in the `reference_notion_roadmap.md` auto-memory.
- **Docs follow-up PR** — after cleanup, update every doc in "Docs to keep in sync" on a small branch (`docs/<topic>`) + PR.

**What's actually user-owned and why:**

- **Paths outside the repo tree** — the sandbox blocks `ls` / `rm` / `cat` outside `wishi-style/`. Stray typos or system-level dirs must be deleted by the user.
- **Anything the user has explicitly claimed** — e.g. a Stripe product migration they said they'd run, an AWS console action, a domain DNS change.

Before flagging anything as user-owned, check auto-memory. If a `reference_*.md` file has the database ID / command / token for the thing you're about to defer, you have access.

### When building a new user-facing surface

1. Start the dev server (`npm run dev` — DO NOT add sleep/delay; just run it).
2. Hit the route with `curl -sI http://localhost:3000/<route>` to confirm it returns 200.
3. Screenshot via `page.screenshot()` in a throwaway Playwright test if you want to see what rendered.
4. If you changed a price or copy string, grep for it after — don't assume it rendered as you wrote it.
5. Write a targeted verify spec before calling the task done. Test plans with "[ ] manual QA" items are a code smell — replace each with an automated check.

## Stack

- **Framework:** Next.js 16 (App Router, TypeScript strict, Turbopack)
- **Styling:** Tailwind CSS 4 + shadcn/ui (Nova preset, Radix base)
- **Database:** RDS Postgres 16 via RDS Proxy, Prisma 7 ORM with PG adapter
- **Auth:** Clerk (Google + Apple + Email) with RBAC via publicMetadata
- **Payments:** Stripe (one-time + subscription checkout, webhooks, billing portal)
- **Chat:** Twilio Conversations (real-time messaging, media)
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
│   ├── staging.tfvars
│   └── production.tfvars
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts            Entry point for seeding (Plans, Quizzes)
│   └── seeds/             Domain seeders (plans.ts, quizzes.ts)
├── src/
│   ├── app/
│   │   ├── (client)/      Client routes: /sessions, /sessions/[id]/chat, /bookings, /settings
│   │   ├── (stylist)/     Stylist routes: /stylist/dashboard, /stylist/sessions/[id]/chat
│   │   ├── (admin)/       Admin routes: /admin/*
│   │   ├── api/           health, webhooks/{clerk,stripe,twilio}, uploads, stylists, subscriptions, billing, chat/{token,media}, push/{subscribe,vapid-key}
│   │   ├── match-quiz/    Public match quiz (guest + authenticated)
│   │   ├── stylists/      Public stylist directory + profiles
│   │   ├── sign-in/       Clerk sign-in
│   │   └── sign-up/       Clerk sign-up
│   ├── components/        nav/, profile/, quiz/, stylist/, session/, booking/, chat/, ui/
│   ├── generated/prisma/  Generated client (gitignored)
│   └── lib/               prisma.ts, stripe.ts, twilio.ts, auth/, payments/, quiz/, matching/, sessions/, services/, chat/, notifications/, s3.ts, plans.ts
├── next.config.ts         output: standalone
└── prisma.config.ts       Prisma 7 config
```

## Key conventions

- **Prisma client:** Lazy-initialized via Proxy pattern in `src/lib/prisma.ts` — does not throw at import time (required for Docker builds without DATABASE_URL).
- **Stripe / Twilio clients:** Same lazy Proxy pattern in `src/lib/stripe.ts` and `src/lib/twilio.ts`. `getTwilioConfig()` returns the raw config values for AccessToken construction.
- **API routes that hit the DB:** Must export `const dynamic = "force-dynamic"` to prevent Next.js from pre-rendering at build time.
- **Secrets:** All secrets in AWS Secrets Manager under `wishi/<env>/` — never in env vars or GitHub Secrets.
- **Auth guards:** Use `requireRole()` from `src/lib/auth` in route group layouts; `requireAuth()` for role-agnostic checks. Both call `unauthorized()` / `forbidden()` from `next/navigation`. Server Components / Actions that need to see E2E_AUTH_MODE users use `getServerAuth()` from `src/lib/auth/server-auth.ts` — bare Clerk `auth()` returns `userId=null` in e2e mode.
- **Clerk types:** Import `UserRole` and other Prisma enums from `@/generated/prisma/client` (not `@/generated/prisma`).
- **Proxy (not middleware):** Next.js 16 uses `src/proxy.ts` with `export default clerkMiddleware()`. The file convention is `proxy`, not `middleware`.
- **Route groups:** `(client)` routes at `/sessions`, `/settings` etc. `(stylist)` routes at `/stylist/*`. `(admin)` routes at `/admin/*`. No overlapping paths between groups — `/(client)/stylists` collided with public `/stylists`, so the authed top-matches view is at `/matches`.
- **S3 uploads:** Presigned PUT URLs via `src/lib/s3.ts`. Client uploads directly to S3, then confirms via Server Action.
- **DB connections:** Always `?sslmode=require` — RDS rejects unencrypted connections.
- **Docker builds:** Build context is the repo root, Dockerfile at `docker/Dockerfile`, target platform `linux/amd64`.
- **Terraform:** Bootstrap applied locally with admin creds. Main infra uses S3 backend (`terraform init -backend-config=staging.tfbackend`).
- **Quiz engine:** Data-driven. Quiz questions live in DB (`Quiz` / `QuizQuestion` tables), seeded via `prisma/seeds/quizzes.ts`. `fieldKey` on each question maps to the destination model via `src/lib/quiz/field-router.ts`.
- **Chat architecture:** Twilio Conversations handles real-time transport. Messages mirror to the `Message` table via `/api/webhooks/twilio`. Twilio identity = `user.clerkId`. Message metadata (kind, mediaUrl, boardId) lives in Twilio message `attributes` JSON, not the body.
- **System messages:** Templates in `src/lib/chat/system-templates.ts`. Sent via Twilio API with `author: "system"` and `kind: SYSTEM_AUTOMATED` in attributes.
- **Twilio REST messages and webhooks:** Server-sent messages via the Twilio REST API DO NOT fire webhooks by default — Twilio suppresses them to prevent infinite loops. To make a server-sent message persist via our `/api/webhooks/twilio` handler, pass `xTwilioWebhookEnabled: "true"` to `messages.create()`.
- **Local Twilio webhooks:** Twilio webhooks need a public URL — `localhost:3000` is unreachable. For local dev, set `TWILIO_WEBHOOK_URL` in `.env` to your ngrok tunnel URL (`ngrok http 3000`) and configure the same URL on the Twilio Conversations Service. The route handler uses `TWILIO_WEBHOOK_URL` for signature verification when set; otherwise reconstructs from `X-Forwarded-*` headers (which is what works behind ALB).
- **Boards:** Polymorphic `Board` (`type = MOODBOARD | STYLEBOARD`). `BoardItem.source` = `INVENTORY | CLOSET | INSPIRATION_PHOTO | WEB_ADDED` with a raw-SQL CHECK constraint enforcing exactly one source field is populated. Restyles are `Board(type=STYLEBOARD, isRevision=true, parentBoardId=<original>)`. Profile boards are `Board(sessionId=null, stylistProfileId=<self>, isFeaturedOnProfile=true, profileStyle=<style>)`. After running migrations, apply `prisma/migrations/phase4_constraints.sql` by hand — Prisma can't express the polymorphism CHECK or the partial unique indexes on `favorite_items`.
- **Canvas styleboard model:** `BoardItem.x/y/zIndex` (nullable) stores LookCreator drag-drop position; `Board.description/tags` (nullable) carry save-dialog metadata. All fields are additive — moodboards + legacy styleboards stay intact; the client-side viewer remains a columns-2 mosaic and ignores x/y. `sendStyleboard` enforces `items.length >= 3` and persists `{ title, description, tags }` in the same atomic transaction that flips `sentAt`.
- **Pending actions:** `src/lib/pending-actions/` exposes `openAction(sessionId, type, opts)` / `resolveAction(sessionId, type, opts)` / `expireAction(id)`. Default `dueAt` offsets (24h/48h/72h/6h) live in `policy.ts`. Every state-transition in `src/lib/sessions/transitions.ts` and `src/lib/boards/*.service.ts` rolls actions atomically in a transaction.
- **Session transitions:** `src/lib/sessions/transitions.ts` owns `activateSession`, `requestEnd`, `approveEnd`, `declineEnd`, `freezeSession`, `unfreezeSession`, `detectPendingEnd`. Each mutation (a) updates the session, (b) writes a SYSTEM_AUTOMATED chat message via `sendSystemMessage`, (c) rolls pending actions, (d) fan-outs notifications via `lib/notifications/dispatcher.ts`.
- **Inventory service:** Wishi does NOT store product data locally. `src/lib/inventory/inventory-client.ts` proxies the tastegraph inventory service (`INVENTORY_SERVICE_URL`). 5-minute in-process cache; returns empty arrays on failure so the board builder's Inventory tab degrades gracefully. `inventoryProductId` stored on `BoardItem` / `Message.singleItemInventoryProductId` / `FavoriteItem` is a plain string — resolve it via `/api/products/[id]` at render time. The full DTO contract (search modes `fts`/`semantic`/`vector`/`direction`, all filter fields, `searchBatch`, `searchCandidates`, `getEmbeddings`, `getDirectionEmbeddings`, `searchSuitPairs`, `getFilterSchema`) is mirrored in `types.ts` + wrapped in `inventory-client.ts`. The local tastegraph clone at `~/tastegraph/ai-stylist-platform/` is the source of truth when types drift.
- **Stylist Shop workspace:** `src/lib/inventory/shop-inventory.service.ts` orchestrates the LookCreator Shop tab — resolves client styling context, applies smart defaults (in-stock, gender, size, budget, exclude-leather), routes to the right search mode (semantic / keyword / vector / direction), runs the search, applies client dislike filtering + like ranking, and adapts to the chrome's InventoryItem shape. Power modes (`similarToProductId`, `directionFromListingIds`) bypass query construction and feed pre-computed embeddings via `mode: "vector"` / `mode: "direction"`. The same service is used by SSR (`page.tsx`) and the paginated client fetches (`/api/stylist/sessions/[id]/shop-inventory*`) so the pipeline is identical regardless of entry point.
- **Sending boards through chat:** Board helpers use Twilio REST with `xTwilioWebhookEnabled="true"` so the webhook handler persists the `Message` row with `kind = MOODBOARD|STYLEBOARD|RESTYLE` + `boardId` attribute. `src/lib/chat/send-message.ts` centralises the Twilio call; don't call `twilioClient.conversations...messages.create` directly from service code.
- **`useChat` resilience:** `useChat` does NOT hard-fail when Twilio is unreachable — it bootstraps from `/api/sessions/[id]/messages` (DB-mirrored rows) in parallel with the Twilio handshake and surfaces an error only when both paths fail. Inline MoodBoard / StyleBoard / SingleItem cards rely on the API surfacing `boardId` / `singleItemInventoryProductId` / `singleItemWebUrl` / `authorClerkId` so DB-bootstrapped rows render the same as Twilio-streamed ones.
- **Prisma JSON fields:** Use `as Prisma.InputJsonValue` when passing `Record<string, unknown>` to JSON columns — Prisma's strict types reject plain Records.
- **Seeding:** `npx prisma db seed` or `npx tsx prisma/seed.ts` with DATABASE_URL set. Seeds are idempotent (upserts).
- **Workers:** Scheduled background jobs live under `src/workers/`. `entry.ts` reads `process.env.WORKER` and dispatches. One shared ECS task definition (`docker/Dockerfile.worker`) is invoked by `aws_scheduler_schedule` rules in `infra/modules/workers` and `infra/modules/scheduler` — the scheduler passes `WORKER=<name>` via `containerOverrides`. Handlers: `affiliate-ingest` (daily), `affiliate-prompt` (15m), `pending-action-expiry` (15m, owns `session.overdue` notification emission), `stale-cleanup` (daily), `waitlist-notify` (hourly), `payout-reconcile` (Mondays 06:00 UTC), `loyalty-recalc` (monthly). All guarded by `src/lib/workers/auth.ts` (`x-worker-secret` header matched against `WORKER_SHARED_SECRET`; fails closed when unset). Admin UI fires any worker manually via `POST /api/admin/workers/[name]/run`.
- **Affiliate tracking:** Click-through commerce in `src/lib/affiliate/`, `src/lib/orders/`, `src/lib/closet/`. A click writes an `AffiliateClick`. 24h later `affiliate-prompt` fires `affiliate.purchase_check`; user replies "yes" via `POST /api/affiliate/self-report`, which creates `Order(SELF_REPORTED)` + `OrderItem` and auto-creates `ClosetItem` rows. Nightly, `affiliate-ingest` polls `/internal/commissions` and either upgrades that order to `AFFILIATE_CONFIRMED` or creates a fresh confirmed order. `ClosetItem.sourceOrderItemId` links each closet entry back to its Order. `POST /api/closet/from-url` is inline (not a worker) — parses Open Graph and uploads to S3 in the request.
- **Payouts:** `src/lib/payouts/dispatch.service.ts` is the single write path for `Payout` rows + Stripe Transfers. Idempotent via `@@unique([sessionId, trigger])`. Three paths: IN_HOUSE stylist → `status=SKIPPED, skippedReason="in_house_stylist"`, no Stripe call; PLATFORM + `payoutsEnabled=false` → `status=PENDING, skippedReason="connect_not_ready"`, no Stripe call; PLATFORM happy → PENDING → `stripe.transfers.create` → PROCESSING with `stripeTransferId`. Test seam: pass `deps.createTransfer` to mock Stripe in integration tests. `completionTriggerFor(plan)` maps `Plan.payoutTrigger` to `SESSION_COMPLETED` (Mini/Major) or `LUX_FINAL` (Lux). The Lux-milestone `LUX_THIRD_LOOK` payout fires from `sendStyleboard` when `styleboardsSent` hits `Plan.luxMilestoneLookNumber`.
- **Stripe Connect:** `src/lib/stripe-connect.ts` wraps `stripe.accounts`, `stripe.accountLinks`, `stripe.transfers` separately from `src/lib/stripe.ts` so Connect calls are mockable in isolation. `accountIsPayoutReady(account)` is the predicate the `account.updated` webhook uses to flip `StylistProfile.payoutsEnabled`. Onboarding routes at `/api/stylist/onboarding/connect/{start,return}`.
- **Stylist onboarding:** `src/lib/stylists/onboarding.ts` owns the 12-step wizard — `stepSchemas` (Zod), `saveStep`, `advance`, `resume`, `syncOnboardingMetadata` (writes `onboardingStatus` into Clerk `publicMetadata` so the edge proxy doesn't hit Postgres on every request). `src/components/stylist/onboarding-shell.tsx` is the client-side shell. IN_HOUSE stylists skip step 12 (Stripe Connect) and advance straight to `AWAITING_ELIGIBILITY` after step 11. Profile boards (step 5) use `src/lib/boards/profile-boards.service.ts` with `sessionId=null` + `stylistProfileId=<self>` + `isFeaturedOnProfile=true` — min 3 / max 10 per claimed style.
- **Proxy onboarding gate:** `src/proxy.ts` redirects stylists mid-wizard away from `/stylist/*` to `/onboarding/[step]` unless `onboardingStatus ∈ {AWAITING_ELIGIBILITY, ELIGIBLE}`. API routes under `/api/stylist/*` return JSON 403 (so fetch clients don't parse HTML). The wizard's own routes + profile-boards + uploads are exempt. E2E mode short-circuits the gate via `E2E_CLERK_ID_COOKIE` early-return.
- **Tip flow:** `/sessions/[id]/end-session` is the Loveable 3-step `PostSessionModal` (Tip → Review → Share). Server Action `submitEndSessionFeedback` rejects replays when `session.rating` is set, creates the Stripe PaymentIntent (with `idempotencyKey = tip_<sessionId>`) BEFORE writing rating/review, then transitions the session. The durable write for `Session.tipInCents` + `Payment(type=TIP)` happens in the `payment_intent.succeeded` webhook — the Server Action is optimistic. The webhook also fires `notifyStylist({ event: "tip.received", ... })` which writes a `Notification(category=TIP)` row consumed by the stylist bell + sonner toast and fans out email (Klaviyo) and SMS (Twilio).
- **Notifications:** `src/lib/notifications/dispatcher.ts::dispatchNotification` is the single fan-out point for all 28 `NotificationEvent` strings. It writes a `Notification` row first (fail-fast — the in-app surface is the catch-up channel and must never be silently lost), then fans out to email via Klaviyo (all events, opt-out via `NotificationPreference`) and SMS via Twilio (only the 8 events with `smsEnabled: true` in `src/lib/notifications/event-meta.ts`: `tip.received`, `session.booked`, `session.activated`, `session.overdue`, `payout.completed`, `order.shipped`, `order.arrived`, `subscription.retry_failed`). `event-meta.ts` is a TS-exhaustive `Record<NotificationEvent, { category, source, smsEnabled }>` so the map can't drift from the dispatcher's union. The bell (`src/components/notifications/notifications-popover.tsx`) mounts on both surfaces — stylist top bar / dashboard (`counterpartyLabel="Clients"`) and client `SiteHeader` between My Style Sessions and the cart (`counterpartyLabel="Stylists"`). The popover drives off `useNotifications()` which polls `/api/notifications` every 10s, fires sonner toasts for any id newer than the first-fetch baseline, and exposes optimistic `markRead` / `markAllRead`. SMS reads `User.phone`; no `TWILIO_SMS_FROM` env → SMS skipped silently. No Web Push.
- **Loyalty:** `src/lib/loyalty/service.ts` owns `recomputeForUser(userId, { tx? })` — writes both `LoyaltyAccount` (canonical) and `User.loyaltyTier` (denormalised cache) from a single `Session.COMPLETED` count. Tiers: BRONZE 0-2, GOLD 3-7, PLATINUM 8+. Hooked into `sessions/transitions.ts::approveEnd` inside the same transaction that flips the session. The `loyalty-recalc` worker runs monthly as a defensive full-scan recompute for both loyalty tiers AND `StylistProfile.averageRating` (aggregated across `StylistReview.rating` + `Session.rating`).
- **Promotions:** `src/lib/promotions/` owns three coupon-adjacent services. `referral.service.ts::issueReferralCreditIfFirstCompletion` fires from `approveEnd` when `User.referredByUserId` is set and this is the user's first `COMPLETED` session — race-safe via P2002 catch on `ReferralCredit.referredUserId @unique`. `REFERRAL_CREDIT_IN_CENTS` = $20. `claimCredit(userId, maxCents, tx)` consumes unredeemed credits oldest-first and one-phase. `gift-card.service.ts::createGiftCardCheckout` spins a Stripe Checkout (`mode=payment`, `metadata.purpose=GIFT_CARD_PURCHASE`); `applyGiftCardPurchaseFromCheckout` atomically creates 2× `PromoCode` (SESSION + SHOPPING) + 1× `GiftCard` + `Payment(type=GIFT_CARD_PURCHASE)`, idempotency-guarded on `Payment.stripePaymentIntentId`. `redeemPromoCode(code, creditType, tx)` increments `usedCount` atomically via `updateMany`-guard so concurrent redemptions of `usageLimit=1` codes can't oversubscribe. `promo-code.service.ts` handles admin CRUD — SESSION codes mirror to Stripe via `stripe.coupons.create`; SHOPPING codes are Wishi-local. Webhook routing in `webhook-handlers.ts` switches on `metadata.purpose ∈ { UPGRADE | BUY_MORE_LOOKS | DIRECT_SALE | GIFT_CARD_PURCHASE | default-booking }`.
- **Direct-sale commerce:** `src/lib/cart/cart.service.ts` owns the session-scoped cart (upsert on `[userId, inventoryProductId, sessionId]` — re-adds increment quantity). Cart-add is universal — any inventory product the stylist surfaces is addable; fulfillment for non-merchandised SKUs is ops-owned until the universal-fulfillment phase lands (see `WISHI-LAUNCH-PREP.md §B9`). The `MerchandisedProduct.isDirectSale=true` gate is enforced on the *checkout* side (`direct-sale.service.ts` + `/checkout/page.tsx`), not at cart-add. `src/lib/payments/direct-sale.service.ts` creates Stripe Checkout sessions with `automatic_tax.enabled=true` (Stripe Tax is the only tax authority — we never recompute) and a fixed shipping rate (standard $10 or $0 for active Lux sessions). The checkout pre-creates `Order(status=PENDING)` carrying the cart snapshot; the webhook flips PENDING → ORDERED via conditional `updateMany` keyed on `Order.stripeCheckoutSessionId`. `src/lib/orders/admin-orders.service.ts` owns the fulfillment state machine (`ORDERED → SHIPPED → ARRIVED → RETURN_IN_PROCESS → RETURNED`); the `ARRIVED` transition is the single trigger that fires `closet/auto-create.ts` to materialize ClosetItems. `src/lib/orders/client-orders.service.ts` implements the 14-day return window via conditional `updateMany`; admin refunds wrap Stripe `refunds.create` with an `idempotencyKey` keyed on `(orderId, prevRefundedInCents, amountInCents)`. Both `createDirectSaleCheckout` and `refundOrder` accept optional `deps` test seams. The manual closet upload path in `lib/boards/closet.service.ts` MUST NEVER accept `sourceOrderItemId` — that field is reserved for `closet/auto-create.ts` and admin tooling.
- **Closet collections:** `src/lib/collections/collection.service.ts` owns Collection CRUD + `CollectionItem` membership; ownership of `closetItemId`s is re-verified inside the service. `validateCollectionName` is a pure exported helper. Filter facets (Designer, Season, Color, Category) are derived from the user's actual items, not a static taxonomy.
- **Stylist reviews:** `src/lib/stylists/review.service.ts` and `src/lib/stylists/favorite-stylist.service.ts` back `/api/favorites/stylists` + `/api/stylists/[id]/reviews`. **The end-session flow is the only write path** — `submitEndSessionFeedback` writes `Session.rating` + `Session.reviewText` once per session and blocks replays. There is no public "Write a Review" affordance on the stylist profile, and clients cannot edit a review once submitted. The legacy `StylistReview` table is retained for historical rows; `listStylistReviews` still aggregates both sources with explicit-overrides-session per-user de-dup, and `recomputeAverageRating` runs the same dedup so the cached `StylistProfile.averageRating` matches the visible list. The reviews endpoint exposes only `GET`.
- **Admin:** `(admin)` route group uses `requireAdmin()`. Every admin mutation writes an `AuditLog` row via `writeAudit({ actorUserId, action, entityType, entityId, meta })` from `src/lib/audit/log.ts`. Session/subscription override predicates live in `src/lib/services/admin-guards.ts` as pure functions for testability. Impersonation uses Clerk actor tokens (`clerkClient().actorTokens.create`); the `act` claim is detected by `ImpersonationBannerMount` in the root layout and by `assertNotImpersonating()` for destructive-action guards. Quiz builder rewrites all `QuizQuestion` rows in a single transaction using a two-pass `sortOrder` offset (temp 100000+i then target i) to avoid `(quizId, sortOrder)` unique-constraint conflicts.

## Locked decisions in effect

Standing product / architectural decisions. Expressed as decisions, not change-log entries.

- **Loveable parity model.** Wishi UI parity targets the *latest* HEAD on the relevant Loveable repo (`smart-spark-craft` for client, `wishi-reimagined` for stylist), not a pinned SHA. Mirror Loveable verbatim — substituting equivalents (e.g. wrapping ChatWindow in different chrome) is the drift source. If Loveable shows it, we ship it.
- **Match-quiz men's flow.** Picking Men routes `step 1 → step 3` and skips Body Type forward + back. Men's mood-board order: **Streetwear → Rugged → Edgy → Cool → Elegant**. `localStorage.wishi_department` persisted on selection. Department selector is two plain pill buttons (text content "Women" / "Men", no `aria-label`). No styles counter rendered under the vote buttons.
- **Style-quiz gate.** Gated on `StyleProfile.quizCompletedAt`. Active funnel today: `/bookings/success` (after Stripe checkout) → if quiz incomplete, "Take Style Quiz" CTA → `/sessions/{id}/style-quiz` → `/sessions/{id}/chat`. Mid-session also gates: `/sessions/{id}/chat` redirects to `/sessions/{id}/style-quiz` if incomplete. `/settings` exposes a "Retake quiz" link. Standalone `/style-quiz` is reachable via direct URL (redirects to `/stylists` after submit) but no current funnel pushes users there. The page renders a verbatim port of Loveable's `smart-spark-craft/src/pages/StyleQuiz.tsx` (26 steps, only steps 0 + 1 required) — see `src/app/style-quiz/style-quiz-loveable.tsx`. Both surfaces reuse the same component, differing only in the `SubmitContext` they pass to `submitStyleQuiz`. Admin quiz-builder no longer manages STYLE_PREFERENCE — it's MATCH-only.
- **SharedBoard access.** `/board/[boardId]` is public-by-default. Anyone with the URL can see any *sent* STYLEBOARD; drafts (`sentAt = null`) 404. No token / expiry infrastructure.
- **Authed top-matches lives at `/matches`.** `/(client)/stylists` collided with the public `/stylists` directory; the rebuild renamed to `/matches`. Loveable's `/stylist-match` exists in the rebuild as a Server Component that 307-redirects to `/sign-in` when unauthed and to `/matches` when authed.
- **Permanent retailer-link redirects.** `/closet` 308 → `/profile` (Loveable has no `/closet`). `/bag` 308 → `/cart`.
- **Stylist sessions list.** `/stylist/sessions` collapses to `redirect("/stylist/dashboard")` — Loveable has no equivalent route.
- **Stylist workspace = dashboard right pane.** Loveable's stylist UI has no per-session workspace page; the chat in the dashboard right pane *is* the workspace. The phantom `/stylist/sessions/[id]/workspace`, `/stylist/sessions/[id]`, `/stylist/sessions/[id]/chat`, `/stylist/clients`, and `/stylist/clients/[id]` routes were removed in the Pass-3 parity sweep. Notification fan-outs in `lib/sessions/transitions.ts` + `lib/boards/*.service.ts`, plus builder back-links, target `/stylist/dashboard?session=<id>` — the dashboard reads the query param and pre-selects that session.
- **Stylist URL paraphrase accepted.** Staging keeps file-routed `/stylist/sessions/{id}/moodboards/new` and `/styleboards/new`. Loveable's `/create-moodboard?sid=<id>` and `/create-look?sid=<id>` URL shapes are documented non-ports — URLs aren't pixels.
- **Stylist client surfacing.** Loveable opens `ClientDetailPanel` as an inline sheet from the dashboard "Details" button. Staging mirrors that — no `/stylist/clients/<id>` page exists. The private-note backend (`lib/stylists/private-notes.ts` + `/api/stylist/clients/[id]/note`) stays wired; the UI for editing notes lives inline in the panel.
- **Loyalty tier "silver" unreachable.** `User.loyaltyTier` enum is BRONZE/GOLD/PLATINUM only (`lib/loyalty/service.ts` thresholds 0-2/3-7/8+). Loveable's view shape lists a 5th "silver" tier; the staging adapter does NOT synthesize silver from low session counts. Documented gap until the loyalty service grows SILVER.
- **Stylist `actionLabel` vocabulary diverges from Loveable on purpose.** Loveable's `Start styling` / `View session` / `Awaiting approval` / `View summary` were no-op selectors that broke once real PendingAction states started flowing in production. Replaced by `deriveDashboardAction` in `src/lib/sessions/stylist-dashboard.ts`, which returns `{ label, href, kind }` so every CTA navigates to a real destination. Six labels: `Create Moodboard` (no moodboard sent) → `/moodboards/new`, `Create Look` (looks remain) → `/styleboards/new`, `Review Restyle` (`PENDING_RESTYLE` with `boardId`) → `/styleboards/new?parentBoardId=<X>`, `Awaiting Client` (`endRequestedAt` set) → opens the dashboard chat where the awaiting-approval badge surfaces (the stylist can't self-approve), `View Summary` (`COMPLETED`/`CANCELLED`) → `/stylist/dashboard?session=<id>`, `Open Chat` (everything else) → `/stylist/dashboard?session=<id>`. All kinds are `"navigate"` — the legacy `"approve-end"` kind has been retired. Order matters — terminal/blocking states (completed, end-requested) win over progress states. The card's quota-met dual-CTA pairs the primary (whatever `actionLabel` resolved to) with `End session`. Pinned by `tests/stylist-dashboard-adapters.test.ts` + `tests/e2e/stylist-action-vocabulary.spec.ts`.
- **End-session flow.** Stylist's `End session` dashboard button POSTs to `/api/sessions/[id]/end/request` (was a Loveable mock that only mutated local React state — silently dropped the request, no `END_SESSION_REQUEST` message ever reached the client). Once status is `PENDING_END_APPROVAL`, the client sees two surfaces simultaneously: (a) the inline `EndSessionCard` chat bubble (Approve / Decline buttons) and (b) the foregrounded `EndSessionWrapModal` ("That's a Wrap" popup). Modal CTAs: `Add Looks` → `/api/sessions/[id]/end/decline` then opens `BuyLooksDialog`; `I'm Done` → `/api/sessions/[id]/end/approve` then redirects to `/sessions/[id]/end-session` (tip/rate); `Back to chat` → dismiss-only (modal re-opens on next page load while pending). Lives in `src/components/session/end-session-wrap-modal.tsx`, mounted from `SessionWorkspace` when `viewerRole === "CLIENT"` and `sessionStatus === "PENDING_END_APPROVAL"`.
- **`ClientProfileView` adapter quirks.** Free-text quiz answers (`BodyProfile.bodyIssues`, `SpecificPreference.denimFit`, `jewelryPreference`) split on `,;\n` to fill Loveable's `string[]` chip arrays. Comfort zone resolves `StyleProfile.comfortZone` (new 3-bucket enum from the Loveable port) first, falling back to the legacy `comfortZoneLevel` Int 1-10 for pre-port rows — both buckets land on the same phrases (`STAY_CLOSE / 1-3 → "Stay close"`, `FEW_NEW_ITEMS / 4-7 → "A little outside"`, `NEW_STYLE / 8-10 → "Push my boundaries"`). `UserSocialLink.url` extracts the trailing path segment as a handle (`@feizhen.style` for instagram, bare `feizhen_d` for pinterest/facebook). `bodyProfile.bodyIssues` is surfaced only as `bodyIssueNotes` — the chip array stays empty until the schema grows a separate chip-list column. `bodyProfile.bodyPhotoUrl` (Loveable step 22) is prepended to the `photos` array so it surfaces first in the stylist's view.
- **Plan prices flow from `lib/plans.ts#getPlanPricesForUi()`.** Loveable has hardcoded-price bugs (`$70` Major, `$490` Lux, `$54` Mini); they stay fixed at port time.
- **Locked-out copy** (do NOT reintroduce even if Loveable adds it back): "2 seasonal capsules", "free and priority shipping", "virtual fitting room".
- **LookCreator Shop tab is an intentional non-port for feature surface.** The Loveable Shop tab was designed before we owned tastegraph; mirroring it 1:1 leaves significant inventory capability on the floor (semantic / direction-embedding search, fabric_tier, primaryFabrics, exclude-leather, hierarchical merchant facet, suit-pairs, batch). The Loveable visual layout (3-column shell, view density, drag-drop, canvas, heart, PDP click) is preserved verbatim; the toolbar / filter rail / load-more / smart-defaults chip row / power-mode buttons (Looks like canvas, Suit pair, Find pieces for this look) follow tastegraph's contract instead. Pinned by `tests/e2e/styleboard-shop-search.spec.ts` + `tests/shop-inventory-service.test.ts` + `tests/shop-inventory-defaults.test.ts`.
- **Intentional non-ports** (Loveable patterns we do NOT copy):
  - Clerk replaces Loveable's AuthContext / LoginModal / SignUpModal.
  - Server Components + Server Actions instead of OrdersContext / React-state containers.
  - LookCreator Shop tab (see entry above).
  - **(Reversed 2026-05-11)** `/style-quiz` IS now a verbatim port — earlier rebuild ran a DB-driven quiz shell to share infra with `/match-quiz`; that diverged from Loveable too far and lost most of the structured signals (5-level fit, body photo, country-code phone, shopping reason, work environment, etc.). The Loveable component lives at `src/app/style-quiz/style-quiz-loveable.tsx`. `/match-quiz` keeps using `QuizShell`.

## Staging

- **Public URL (HTTPS):** `https://d2mt49xs07o9rr.cloudfront.net` — CloudFront distribution `E3OU5UE6ODNFHN`, default `*.cloudfront.net` cert. This is the URL to share with testers and to point at in third-party dashboards. When the `wishi.me` Route 53 zone migrates off the legacy AWS account, set `cdn_aliases = ["staging.wishi.me"]` + `cdn_certificate_arn = "..."` in `infra/staging.tfvars` and apply — same distribution, real domain.
- **Origin ALB (HTTP, internal):** `http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com` — kept open so existing webhook URLs (Clerk / Stripe / Twilio) keep delivering. Don't share with browsers.
- **Health:** `https://d2mt49xs07o9rr.cloudfront.net/api/health` → `{ ok: true, db: "up" }`
- **AWS account:** 815935788935, region us-east-1
- **CloudFront origin policy:** `Managed-AllViewer` (forwards cookies + auth + query strings) + `Managed-CachingDisabled` (Next.js owns its own cache). Pure pass-through; no edge caching.
- **Task-definition revisions:** CD (`.github/workflows/cd-staging.yml`) registers a fresh task definition revision on every deploy and updates the service to point at it. Terraform owns the task-definition *shape* (cpu, memory, env, secrets), not the *revision pointer* — `aws_ecs_service.web` carries `lifecycle { ignore_changes = [task_definition] }` so terraform apply can't roll the running service backwards. After a tfvars change that should reach the running service (e.g. APP_URL), trigger a CD deploy or manually clone the latest task def + overlay the live image SHA + `aws ecs update-service`.

## Running locally

```bash
cp .env.example .env
# Fill in DATABASE_URL pointing to a local Postgres
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```
