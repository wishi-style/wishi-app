# Wishi — Client Web App

Styling marketplace rebuilt as a single Next.js 16 monolith on AWS ECS Fargate.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | RDS Postgres 16 + RDS Proxy + Prisma 7 |
| Auth | Clerk (Google + Apple + Email) with RBAC |
| Payments | Stripe (one-time + subscription checkout, webhooks, billing portal) |
| Chat | Twilio Conversations (real-time messaging, media, Web Push) |
| Compute | AWS ECS Fargate behind ALB |
| CDN | CloudFront (pending) |
| CI/CD | GitHub Actions with OIDC auth to AWS |
| IaC | Terraform |

## Local development

```bash
cp .env.example .env
# Fill in DATABASE_URL, Clerk, Stripe, Twilio, VAPID, S3, Klaviyo, EasyPost
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed   # Seeds plans + quiz questions
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test commands

```bash
npm run typecheck          # tsc --noEmit (strict)
npm run lint               # eslint
npm test                   # node --test on tests/**/*.test.ts
npm run e2e                # Playwright e2e (needs DB + E2E_AUTH_MODE)
npm run test:visual        # Playwright visual regression — marketing baselines (12)
npm run test:visual:stylist # Playwright visual regression — stylist baselines (8, runs under dev:e2e)
npm run test:load          # k6 — marketing ramp (100 VUs) — needs BASE_URL
npm run test:load:feed     # k6 — feed API burst
npm run test:load:checkout # k6 — Stripe Checkout burst (needs E2E_CLERK_ID_COOKIE)

# Full end-to-end walkthrough (one-command pre-cohort-launch health check)
npm run dev:e2e &
npx tsx --env-file=.env scripts/e2e-full-walkthrough.ts

# Phase 12 stylist-authoring walkthrough (dashboard/workspace/canvas/send gate/favorites)
npm run dev:e2e &
npx tsx --env-file=.env scripts/e2e-stylist-walkthrough.ts
```

### Local webhooks via ngrok

Twilio + EasyPost webhooks need a public URL. For local dev:

```bash
ngrok http 3000
# Set TWILIO_WEBHOOK_URL to the ngrok URL in .env
# Configure Twilio + EasyPost webhook endpoints to the ngrok URL
```

### Feature flags

`NEXT_PUBLIC_FEATURE_AI_SUGGESTED_REPLIES` (default `false`) gates the
stylist chat "Suggested Replies" chip row. Kept off until Phase 7
(post-launch) ships real AI. The port renders the surface but hides it
behind this flag so the chat window doesn't show a broken affordance.

Related stubs at `/api/ai/suggested-feedback/[boardItemId]`,
`/api/ai/similar-items`, and `/api/ai/suggested-replies/[sessionId]`
return canned / category-based responses so RestyleWizard and the PDP
similar-items carousel render today. Phase 7 replaces the handler
bodies, not the consumers.

## Docker

```bash
docker build -f docker/Dockerfile \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx \
  -t wishi-web .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e CLERK_SECRET_KEY="sk_test_..." \
  wishi-web
```

## Infrastructure

All infrastructure is managed with Terraform in `infra/`.

**Bootstrap** (one-time, applied locally):
```bash
cd infra/bootstrap
terraform init
terraform apply
```

**Staging:**
```bash
cd infra
terraform init -backend-config=staging.tfbackend
terraform apply -var-file=staging.tfvars
```

## Deployment

Pushes to `main` auto-deploy to staging via GitHub Actions. Production deploys are manual (workflow dispatch with required reviewer).

**Staging URL:** `http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com`

Full deploy + rollback + incident-response procedures: [`docs/runbook.md`](./docs/runbook.md).

## Further reading

- [`docs/architecture.md`](./docs/architecture.md) — system diagram, data model, integrations, worker topology
- [`docs/runbook.md`](./docs/runbook.md) — on-call procedures
- [`docs/adr/`](./docs/adr/) — architecture decision records (why we made key calls)
- [`WISHI-REBUILD-PLAN.md`](../WISHI-REBUILD-PLAN.md) (in parent dir) — phase-by-phase build plan

## Project structure

```
├── .github/workflows/    CI/CD pipelines
├── docker/               Multi-stage Dockerfile
├── infra/                Terraform (bootstrap + modules)
├── prisma/
│   ├── schema.prisma     Prisma schema (Users, Sessions, Chat, Boards, Closet, Favorites, Inventory refs)
│   ├── seed.ts           Entry point for seeding
│   └── seeds/            Domain seeders (plans, quizzes)
└── src/
    ├── app/
    │   ├── (client)/     Client routes: /sessions, /sessions/[id]/workspace, /sessions/[id]/moodboards/*, /sessions/[id]/styleboards/*, /sessions/[id]/end-session, /sessions/[id]/buy-more-looks, /closet, /collections/[id], /favorites, /orders, /settings
    │   ├── (stylist)/    Stylist routes: /onboarding/[step], /stylist/dashboard, /stylist/sessions/*, /stylist/clients, /stylist/clients/[id], /stylist/profile/boards, /stylist/payouts
    │   ├── (admin)/      Admin routes: /admin/dashboard, /admin/users, /admin/sessions, /admin/subscriptions, /admin/stylists, /admin/looks, /admin/inspiration-photos, /admin/quiz-builder, /admin/orders, /admin/promo-codes, /admin/audit-log
    │   ├── api/          health, webhooks/{clerk,stripe,twilio}, products, moodboards, styleboards, closet, collections, favorites/{boards,items,stylists}, inspiration-photos, cart, orders, payments/checkout, sessions/[id]/end/{request,approve,decline}, sessions/[id]/upgrade, stylist/onboarding/{save,advance,connect/{start,return}}, stylist/profile/boards, stylists/[id]/{waitlist,reviews}, payments/payouts, workers/{waitlist-notify,payout-reconcile}, admin/orders/[id]/{tracking,status,notes,refund,approve-refund}, uploads, stylists, subscriptions, billing, chat, push
    │   ├── match-quiz/   Public match quiz (guest + authenticated)
    │   ├── stylists/     Public stylist directory + profiles
    │   ├── sign-in/      Clerk sign-in
    │   └── sign-up/      Clerk sign-up
    ├── components/       nav/, profile/, quiz/, stylist/, session/, booking/, chat/, board/, closet/, ui/
    ├── lib/              prisma.ts, stripe.ts, stripe-connect.ts, twilio.ts, web-push.ts, auth/, payments/, payouts/, promotions/, loyalty/, orders/, cart/, collections/, closet/, quiz/, matching/, sessions/, services/, chat/, boards/, inventory/, pending-actions/, notifications/, stylists/, workers/, audit/, s3.ts, plans.ts
    ├── workers/          waitlist-notify.ts, payout-reconcile.ts, loyalty-recalc.ts, demo-reset.ts (HTTP endpoints at /api/workers/*)
    └── generated/        Prisma client (gitignored)
```
