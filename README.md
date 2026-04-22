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
# Fill in DATABASE_URL, Clerk keys, Stripe keys, Twilio keys, VAPID keys, and S3 bucket
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed   # Seeds plans + quiz questions
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

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
    │   ├── (client)/     Client routes: /sessions, /sessions/[id]/workspace, /sessions/[id]/moodboards/*, /sessions/[id]/styleboards/*, /sessions/[id]/end-session, /sessions/[id]/buy-more-looks, /closet, /orders, /settings
    │   ├── (stylist)/    Stylist routes: /onboarding/[step], /stylist/dashboard, /stylist/sessions/*, /stylist/clients, /stylist/clients/[id], /stylist/profile/boards, /stylist/payouts
    │   ├── (admin)/      Admin routes: /admin/inspiration-photos, /admin/orders
    │   ├── api/          health, webhooks/{clerk,stripe,twilio}, products, moodboards, styleboards, closet, favorites, inspiration-photos, cart, orders, payments/checkout, sessions/[id]/end/{request,approve,decline}, sessions/[id]/upgrade, stylist/onboarding/{save,advance,connect/{start,return}}, stylist/profile/boards, payments/payouts, workers/{waitlist-notify,payout-reconcile}, admin/orders/[id]/{tracking,status,notes,refund,approve-refund}, uploads, stylists, subscriptions, billing, chat, push
    │   ├── match-quiz/   Public match quiz (guest + authenticated)
    │   ├── stylists/     Public stylist directory + profiles
    │   ├── sign-in/      Clerk sign-in
    │   └── sign-up/      Clerk sign-up
    ├── components/       nav/, profile/, quiz/, stylist/, session/, booking/, chat/, board/, closet/, ui/
    ├── lib/              prisma.ts, stripe.ts, stripe-connect.ts, twilio.ts, web-push.ts, auth/, payments/, payouts/, quiz/, matching/, sessions/, services/, chat/, boards/, inventory/, pending-actions/, notifications/, stylists/, workers/, s3.ts, plans.ts
    ├── workers/          waitlist-notify.ts, payout-reconcile.ts (HTTP endpoints at /api/workers/*)
    └── generated/        Prisma client (gitignored)
```
