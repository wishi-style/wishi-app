@AGENTS.md

# Wishi Platform — Client Web App

## What is this

Wishi is a styling marketplace. This repo is the Next.js 16 monolith (client, stylist, and admin route groups) deployed on AWS ECS Fargate.

## Stack

- **Framework:** Next.js 16 (App Router, TypeScript strict, Turbopack)
- **Styling:** Tailwind CSS 4 + shadcn/ui (Nova preset, Radix base)
- **Database:** RDS Postgres 16 via RDS Proxy, Prisma 7 ORM with PG adapter
- **Auth:** Clerk (Google + Apple + Email) — not yet implemented
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
│   └── schema.prisma      User model + pg_trgm (more models added per phase)
├── src/
│   ├── app/               Next.js App Router (api/, route groups coming)
│   ├── components/ui/     shadcn/ui components
│   ├── generated/prisma/  Generated client (gitignored)
│   └── lib/               prisma.ts, utils.ts
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

## Build phase progress

- [x] Phase 0: AWS Foundation (ECS, RDS, ALB, S3, CI/CD)
- [x] Phase 1: Authentication & User Management
- [ ] Phase 2: Quizzes, Booking & Payments
- [ ] Phase 3: Real-Time Chat
- [ ] Phase 4: Moodboards & Styleboards
- [ ] Phase 5: Inventory Integration
- [ ] Phase 6: Stylist Dashboard & Payouts
- [ ] Phase 7: AI Features
- [ ] Phase 8: Admin Panel
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
