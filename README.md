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

Both staging and production deploys are manual (`workflow_dispatch`). CI runs build/lint/typecheck/tests on every PR and merge to main; deploys are triggered explicitly when ready.

```bash
# 1. Apply migrations to the target DB locally first
DATABASE_URL=<staging-url> npx prisma migrate deploy

# 2. Trigger the deploy
gh workflow run "Deploy Staging"
# or for prod (requires reviewer):
gh workflow run "Deploy Production"
```

`Deploy Staging` builds + pushes the image, updates the ECS service, and polls `/api/health` to verify.

**Staging URL:** `http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com`

## Project structure

```
├── .github/workflows/    CI/CD pipelines
├── docker/               Multi-stage Dockerfile
├── infra/                Terraform (bootstrap + modules)
├── prisma/
│   ├── schema.prisma     30 models, 26 enums
│   ├── seed.ts           Entry point for seeding
│   └── seeds/            Domain seeders (plans, quizzes)
└── src/
    ├── app/
    │   ├── (client)/     Client routes: /sessions, /sessions/[id]/chat, /bookings, /settings
    │   ├── (stylist)/    Stylist routes: /stylist/dashboard, /stylist/sessions, /stylist/sessions/[id]/chat
    │   ├── (admin)/      Admin routes: /admin/*
    │   ├── api/          health, webhooks/{clerk,stripe,twilio}, uploads, stylists, subscriptions, billing, chat, push
    │   ├── match-quiz/   Public match quiz (guest + authenticated)
    │   ├── stylists/     Public stylist directory + profiles
    │   ├── sign-in/      Clerk sign-in
    │   └── sign-up/      Clerk sign-up
    ├── components/       nav/, profile/, quiz/, stylist/, session/, booking/, chat/, ui/
    ├── lib/              prisma.ts, stripe.ts, twilio.ts, web-push.ts, auth/, payments/, quiz/, matching/, sessions/, services/, chat/, s3.ts, plans.ts
    └── generated/        Prisma client (gitignored)
```
