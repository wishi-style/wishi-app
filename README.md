# Wishi — Client Web App

Styling marketplace rebuilt as a single Next.js 16 monolith on AWS ECS Fargate.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | RDS Postgres 16 + RDS Proxy + Prisma 7 |
| Auth | Clerk (Google + Apple + Email) with RBAC |
| Compute | AWS ECS Fargate behind ALB |
| CDN | CloudFront (pending) |
| CI/CD | GitHub Actions with OIDC auth to AWS |
| IaC | Terraform |

## Local development

```bash
cp .env.example .env
# Fill in DATABASE_URL, Clerk keys, and S3 bucket
npm install
npx prisma generate
npx prisma migrate dev
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
├── prisma/               Schema + migrations
└── src/
    ├── app/
    │   ├── (client)/     Client routes: /sessions, /settings
    │   ├── (stylist)/    Stylist routes: /stylist/*
    │   ├── (admin)/      Admin routes: /admin/*
    │   ├── api/          health, webhooks/clerk, uploads/presigned
    │   ├── sign-in/      Clerk sign-in
    │   └── sign-up/      Clerk sign-up
    ├── components/       nav/, profile/, ui/
    ├── lib/              prisma.ts, auth/, s3.ts, utils.ts
    └── generated/        Prisma client (gitignored)
```
