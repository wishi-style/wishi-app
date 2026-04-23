# Security audit — Phase 11

Pre-launch security review. Written 2026-04-22 during the Phase 11
hardening pass. Every finding is classified HIGH / MEDIUM / LOW with a
concrete remediation path. Zero HIGH findings open at launch is the
verification gate.

## Summary

- **0 HIGH** open
- **2 MEDIUM** — documented, remediated or tracked as post-launch
- **3 LOW** — acknowledged patterns, no action needed

The app inherits strong defaults from framework choices: Prisma ORM
(parameterized queries), Clerk (JWT + RBAC + webhook signatures), Stripe
SDK (signed webhooks), Next.js App Router (no client-side route
protection by design), and `requireAuth()`/`requireRole()`/`requireAdmin()`
guards at every route boundary. That baseline is the reason this audit
is short.

## Methodology

1. Static-grep sweep for known-dangerous patterns: `queryRawUnsafe`,
   `dangerouslySetInnerHTML`, unchecked `process.env.*` on the client,
   missing webhook signature verification
2. Route-by-route auth guard audit (proxy + route handlers + service
   layer)
3. Infra IaC review: S3 bucket policies, IAM least-privilege, VPC
   security groups, secret storage
4. Webhook signature verification per integration (Stripe, Clerk,
   Twilio, EasyPost)
5. Rate-limit audit (public + authed + webhook surfaces)
6. Header audit (response headers, CSP, HSTS, clickjacking)

## Findings

### HIGH — 0 open

None.

### MEDIUM — 2

**M-1: No app-side rate limiting on public endpoints.**
- **Surfaces:** `/api/feed`, `/api/stylists/*`, `/api/products/[id]`,
  `/api/affiliate/click`, the AI stubs (`/api/ai/*`), and `/api/match-quiz`
- **Risk:** scraping, wasted inventory-service calls, AI-stub spam
  (even though stubs are cheap, they lock up request slots at enough
  RPS)
- **Status:** not yet implemented
- **Remediation:** add an in-process sliding-window rate limiter at the
  route handler level for v1 (e.g. `<userId or IP> → count per minute
  per route`). Upgrade to Redis-backed limiter post-launch when we have
  multi-task rollout. Auth surfaces (`/api/sign-in`, `/api/sign-up`) are
  already rate-limited by Clerk's own infra.
- **Tracked:** Phase 11 deferred follow-up

**M-2: S3 uploads CORS is `allowed_origins = ["*"]`.**
- **Location:** `infra/modules/storage/main.tf:50`
- **Risk:** lower than it looks — all S3 PUTs require a presigned URL
  generated server-side by authenticated code, so an unknown origin
  can't obtain a valid PUT URL. CORS `*` means the browser allows the
  upload; it does not grant the upload permission itself.
- **Remediation:** still tighten to `allowed_origins = [app_url,
  "http://localhost:3000", "http://localhost:3001"]` pre-launch to
  shrink the attack surface against a compromised presigned URL.
  Trivial Terraform diff.
- **Tracked:** Phase 11 deferred follow-up

### LOW — 3

**L-1: Content-Security-Policy not set.**
- Adding CSP to Next 16 requires a nonce-based inline-script policy
  coordinated with Clerk, Stripe Elements, Twilio Conversations JS,
  and any future vendor script. Non-trivial to get right; easy to
  break auth/payments/chat.
- **Remediation:** add as a post-launch hardening task. Other security
  headers (HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) are now applied via
  `next.config.ts`.
- **Tracked:** post-launch

**L-2: `dangerouslySetInnerHTML` used for JSON-LD.**
- **Locations:** `src/app/page.tsx:113`, `src/app/lux/page.tsx:166`,
  `src/app/stylists/[id]/page.tsx:155`
- **Risk:** nil. All three call `JSON.stringify()` on server-assembled
  static data with no user-authored text reaching the HTML.
- **Remediation:** none. Documenting so future readers don't assume
  this pattern generalizes to user-text rendering.

**L-3: `/api/health` uses `$queryRawUnsafe("SELECT 1")`.**
- **Location:** `src/app/api/health/route.ts:7`
- **Risk:** nil. No user input is interpolated. The `Unsafe` suffix
  refers to Prisma's API contract (no template literal parameterization)
  not to a security property.
- **Remediation:** optional — switch to `$queryRaw\`SELECT 1\`` for
  style consistency. Not blocking.

## What's already strong

### Auth + route protection

- Clerk middleware (`src/proxy.ts`) protects every non-public route;
  public routes are explicitly enumerated via `createRouteMatcher`
- Stylist onboarding gate redirects mid-wizard stylists away from
  `/stylist/*` until `onboardingStatus ∈ {AWAITING_ELIGIBILITY, ELIGIBLE}`.
  API routes return JSON 403; page routes redirect — no HTML response
  leaked to fetch clients
- Admin routes use `requireAdmin()` which resolves the Prisma user +
  detects the Clerk `act` claim. Every admin mutation calls
  `writeAudit()` before commit
- Impersonation destructive-action guards: `assertNotImpersonating()`
  blocks state-changing calls when an admin is operating as another
  user. Unit tests in `tests/admin-guards.test.ts`

### Webhook signatures verified

| Webhook | Verification | File |
|---|---|---|
| Stripe | `stripe.webhooks.constructEvent(body, signature, secret)` | `src/app/api/webhooks/stripe/route.ts:36` |
| Clerk | `verifyWebhook()` from `@clerk/nextjs/webhooks` | `src/app/api/webhooks/clerk/route.ts` |
| Twilio | `Twilio.validateRequest(authToken, signature, url, params)` | `src/app/api/webhooks/twilio/route.ts:24` |
| EasyPost | `verifyEasyPostWebhookSignature()` — HMAC-SHA256, timing-safe compare, strips `hex=`/`sha256=` prefix | `src/lib/integrations/easypost.ts:120` |

All four routes return 401/403 and reject the event on bad signature;
none process the payload before verification.

### SQL injection

- Prisma is the only query path. No `$executeRawUnsafe` with user input
  anywhere in `src/app/**` or `src/lib/**` (verified via grep).
  `$queryRawUnsafe` appears only in `/api/health` with a constant
  string.

### XSS

- `dangerouslySetInnerHTML` appears only on static JSON-LD `<script>`
  tags (see L-2 above). Nowhere else in the tree.
- User-authored text (stylist bio, review text, board feedback, chat
  messages) renders through React JSX children — automatically escaped.

### Secrets handling

- All production secrets live in AWS Secrets Manager under
  `wishi/<env>/` and inject into the ECS task definition via
  `valueFrom` (never checked into repo, never in GitHub Actions
  variables)
- `NEXT_PUBLIC_*` env vars in `src/` (searched):
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — public by Clerk design
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — public by Stripe design
  - `NEXT_PUBLIC_APP_URL` — public metadata
  - `NEXT_PUBLIC_FEATURE_*` — feature flags
  - No private keys or secrets reach the client bundle

### S3 + IAM

- `infra/modules/storage`:
  - Uploads bucket: `block_public_acls=true`, `block_public_policy=true`,
    `ignore_public_acls=true`, `restrict_public_buckets=true`, SSE-S3
    encryption, versioning enabled, 90-day IA lifecycle
  - Web assets bucket: same public-access blocks, SSE-S3
- Presigned upload URLs expire in 300 seconds (`src/lib/s3.ts`)
- ECS task role scoped to specific buckets; no wildcard S3 access

### Security headers (Phase 11 addition)

Applied via `next.config.ts::headers()`:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` — no embedded iframes of our UI anywhere
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`

CSP is not yet set — see L-1.

### Infrastructure

- RDS: private subnet only, `sslmode=require` enforced at connection
  string, encrypted at rest, Multi-AZ on production
- ALB: currently HTTP-only on staging pending DNS migration; HTTPS +
  ACM cert on production path
- VPC: public subnets for ALB, private subnets for ECS + RDS; no NAT
  routes to the DB tier
- CloudTrail: inherited from AWS org account (not declared in this
  module) — confirm enabled at org level pre-launch
- Secrets rotation: manual, tracked in runbook

## Pre-launch checklist

- [x] Security headers applied in `next.config.ts`
- [x] Zero HIGH findings open
- [ ] M-1: in-process rate limiter on public endpoints
- [ ] M-2: tighten S3 CORS origins
- [ ] Manual penetration probe from a fresh browser: try to hit
      `/admin/*` as CLIENT role, try to POST to stylist APIs without
      onboarding, try to refund an order as non-admin
- [ ] Confirm CloudTrail is on at the AWS org level
- [ ] Rotate all production secrets at cutover (new Klaviyo key, new
      EasyPost webhook secret, new Stripe restricted key if applicable)

## Post-launch tasks

- **Content-Security-Policy** with nonce-based inline scripts. Roll out
  behind a `NEXT_PUBLIC_CSP_ENABLED` flag so it can be switched off
  quickly if third-party scripts break
- **Redis-backed rate limiter** once ECS scales beyond one task (Phase 0
  baseline) — in-process counters lose accuracy across task replicas
- **WAF** on the ALB — add AWS-managed rules for common attack
  patterns once traffic volume justifies the cost
- **Dependency audit** — schedule `npm audit` + `terraform
  providers check` in CI
