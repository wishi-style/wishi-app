# Architecture

Wishi runs as a single Next.js 16 monolith on AWS ECS Fargate with a shared
background-worker task definition. One Postgres database behind RDS Proxy.
One ALB. Everything else is either a managed provider (Clerk, Stripe,
Twilio, Klaviyo, EasyPost, Anthropic) or an internal service (tastegraph
inventory, Mixpanel).

## High-level diagram

```
                    ┌─────────────────────────┐
                    │   Clerk (Auth)          │
                    └──────────┬──────────────┘
                               │ JWT + webhooks
    Users ─► ALB ─► ECS web ───┼───► RDS Postgres (via RDS Proxy)
              │       │        │           │
              │       │        │           │ reads/writes
              │       │        ▼           │
              │       │   Klaviyo API      │
              │       │   EasyPost API     │
              │       │   Anthropic API    │ (Phase 7 — deferred)
              │       │   tastegraph       │
              │       │   inventory API    │
              │       │   Twilio           │
              │       │   Conversations    │
              │       │   Stripe API       │
              │       │                    │
              │       └─► S3 (uploads)     │
              │                            │
              └──► ECS worker task ────────┘
                   (scheduled via EventBridge + API destination)
                   waitlist-notify / payout-reconcile / loyalty-recalc
                   affiliate-ingest / affiliate-prompt / pending-action-expiry
                   stale-cleanup

    Webhooks in:                           Emails out:
      Stripe → /api/webhooks/stripe          Klaviyo Events API
      Clerk  → /api/webhooks/clerk         SMS:
      Twilio → /api/webhooks/twilio          Klaviyo (future)
      EasyPost → /api/webhooks/easypost    Push:
                                             Web Push (VAPID)
```

## Data model at a glance

37 Prisma models, 27 enums. Domain groupings (enforced by comment banners
in `prisma/schema.prisma`):

| Domain | Tables | Notes |
|---|---|---|
| Users & Quiz | User, StylistProfile, QuizQuestion, Quiz, MatchQuizResult | `User.role` drives route groups |
| Sessions | Session, SubscriptionSession, SessionPendingAction, SessionMatchHistory | PLAN / SESSION / PAYMENT linkage |
| Payments | Subscription, Payment, Payout, Plan | Stripe is source of truth; local rows are cached projections |
| Chat | (Twilio-owned) Message | Twilio Conversations persists transport; `Message` is a mirror |
| Boards | Board, BoardItem, BoardPhoto | Polymorphic on `type = MOODBOARD \| STYLEBOARD`, raw-SQL CHECK constraint enforces one-source invariant |
| Closet & Favorites | ClosetItem, FavoriteItem, FavoriteStylist, Collection, CollectionItem | `ClosetItem.sourceOrderItemId` links back to the Order that seeded it |
| Orders | Order, OrderItem | `source = DIRECT_SALE \| SELF_REPORTED \| AFFILIATE_CONFIRMED`; separate state machines per source |
| Commerce Extras | LoyaltyAccount, PromoCode, GiftCard, ReferralCredit, CartItem, AffiliateClick | Atomic writes with usage-count races guarded via `updateMany` predicates |
| Notifications | NotificationPreference, PushSubscription | Unique per (userId, channel, category); EMAIL falls through to Klaviyo Events API |
| Admin / CMS | AuditLog, AdminImpersonation, InspirationPhoto | `writeAudit()` is the required call site for every admin mutation |

See `wishi-data-models.md` at the repo root for the founder-facing summary.

## External integrations

| Provider | Purpose | Secret | Notes |
|---|---|---|---|
| Clerk | Auth, RBAC, impersonation | `wishi/<env>/clerk/*` | `act` claim drives the impersonation banner + destructive-action guards |
| Stripe | Checkout, subscriptions, Connect, refunds | `wishi/<env>/stripe/*` | Stripe is source of truth; `webhook-handlers.ts` is the only durable write path |
| Twilio Conversations | Real-time chat transport | `wishi/<env>/twilio/*` | REST messages need `xTwilioWebhookEnabled=true` to trigger our webhook |
| tastegraph inventory | Product catalog + semantic search | `INVENTORY_SERVICE_URL` | Wishi stores only `inventoryProductId` strings — no local Product rows |
| Klaviyo | Transactional email (Phase 11) | `wishi/<env>/klaviyo/api_key` | Events API + Flows; event name → Flow → template mapped in Klaviyo UI |
| EasyPost | Carrier tracking (Phase 11) | `wishi/<env>/easypost/{api_key,webhook_secret}` | Trackers created at admin-set-tracking time; webhooks auto-advance status |
| Web Push (VAPID) | Browser push notifications | `wishi/<env>/web_push/*` | In-app push parallel to Klaviyo email |
| Anthropic | AI features (Phase 7 — deferred) | `wishi/<env>/anthropic/api_key` | Stubs live in `/api/ai/*`; real AI is post-launch |
| S3 | User uploads + inspiration photos | IAM-scoped to ECS task role | Presigned PUT URLs, Server Action confirms |

## Worker topology

Two distinct worker delivery mechanisms — kept separate by how the trigger
fires, not by what the worker does.

### ECS task workers (Phase 5)

`infra/modules/workers` defines one shared Fargate task definition that runs
`docker/Dockerfile.worker`. `entry.ts` reads `WORKER` env and dispatches:

| Worker | Cadence | Source |
|---|---|---|
| `affiliate-ingest` | Daily | Polls `/internal/commissions` on the inventory service |
| `affiliate-prompt` | Every 15 min | Fires `affiliate.purchase_check` for clicks older than 24h |
| `pending-action-expiry` | Every 15 min | Flips `SessionPendingAction.status = EXPIRED` + fires `session.overdue` |
| `stale-cleanup` | Daily | Archives session rows past retention |
| `demo-reset` | Daily | Resets the staging demo environment |

### EventBridge → API destination workers (Phase 6 + 9)

`infra/modules/scheduler` declares `aws_scheduler_schedule` rules that HTTPS
POST to the web app with `x-worker-secret`. Gated on `app_url` being
HTTPS — disabled on staging until DNS migrates.

| Worker | Cadence | Purpose |
|---|---|---|
| `waitlist-notify` | Hourly | Fans `stylist.waitlist_available` when a newly eligible stylist matches waitlist entries |
| `payout-reconcile` | Mondays 06:00 UTC | Sweeps in-process Stripe Transfers, flips PROCESSING → PAID |
| `loyalty-recalc` | Monthly (0 0 1 * ?) | Full-scan recompute of `LoyaltyAccount` + `StylistProfile.averageRating` |

Both paths are guarded by `src/lib/workers/auth.ts` — `x-worker-secret` matches
`WORKER_SHARED_SECRET` or the call 401s.

## Request lifecycle

```
Clerk JWT → src/proxy.ts (onboarding gate for stylists) →
  route handler → requireAuth() / requireRole() / requireAdmin() →
  service layer (src/lib/**/*.service.ts) →
  prisma (via RDS Proxy) +
  external call (Stripe / Klaviyo / Twilio / EasyPost / inventory)
```

Mutations that span multiple models or emit external side effects go
through service-layer functions, never raw prisma calls from routes.
Every admin mutation writes an `AuditLog` row via `writeAudit()`.

## Payment flows

Five money paths, all through Stripe, all idempotent by construction:

1. **Subscription checkout** — Stripe Checkout `mode=subscription`. Webhook
   `customer.subscription.created` writes the local `Subscription` row.
2. **Direct-sale checkout** — Stripe Checkout `mode=payment` with cart
   snapshot. Webhook flips `Order(status=PENDING → ORDERED)` via conditional
   `updateMany` on `stripeCheckoutSessionId`.
3. **Upgrade / Buy More Looks** — Stripe Checkout one-time, metadata
   `purpose = UPGRADE | BUY_MORE_LOOKS`; webhook handlers at
   `src/lib/payments/{session-upgrade,buy-more-looks}.service.ts`.
4. **Gift-card purchase** — Stripe Checkout one-time, metadata
   `purpose = GIFT_CARD_PURCHASE`. Atomically creates PromoCode(SESSION) +
   PromoCode(SHOPPING) + GiftCard + Payment. P2002 guards on
   `Payment.stripePaymentIntentId` make replays idempotent.
5. **Stylist payouts** — `src/lib/payouts/dispatch.service.ts` is the single
   write path. Idempotent via `@@unique([sessionId, trigger])`. IN_HOUSE
   stylists short-circuit to SKIPPED rows.

Tip payments are half-optimistic: Server Action creates the PaymentIntent
with `idempotencyKey = tip_<sessionId>`; the durable `Payment(type=TIP)`
row lands in the webhook.

## Observability

- **Structured logs** — route handlers + services log with `console.warn` /
  `console.error`. CloudWatch log groups per service.
- **Alarms** — ALB 5xx rate, ECS unhealthy-task count, RDS CPU, worker
  queue depth. SNS topic fans to Slack.
- **Dashboards** — API latency p50/p95/p99, error rate per route group,
  Stripe webhook delivery rate, DB connection pool usage.
- **Product funnels** — Mixpanel: signup → quiz → match → booking, stylist
  onboarding wizard, session → review.

## Testing layers

| Layer | Tool | Location |
|---|---|---|
| Pure unit | `node --test` + `tsx` | `tests/*.test.ts` |
| Integration (real DB) | `node --test` + prisma | `tests/*-integration.test.ts`, `tests/*-flow.test.ts` |
| E2E (Playwright) | Playwright + `E2E_AUTH_MODE` | `tests/e2e/*.spec.ts` |
| Visual regression | Playwright snapshots | `tests/visual/__snapshots__/` |
| Load | k6 | `tests/load/*.js` |

## Where to look when…

- **"Why did this payout land in SKIPPED?"** → `src/lib/payouts/dispatch.service.ts` comments + `Payout.skippedReason`
- **"Why didn't the webhook fire?"** → `src/lib/payments/webhook-handlers.ts` routing on `metadata.purpose`
- **"Where do notifications dispatch?"** → `src/lib/notifications/dispatcher.ts` (push + Klaviyo); transactional-only at `src/lib/notifications/transactional.ts`
- **"Where are pending actions rolled?"** → `src/lib/pending-actions/` — every session transition calls `openAction` / `resolveAction`
- **"Where's the session state machine?"** → `src/lib/sessions/transitions.ts`
- **"What actually fires the ARRIVED → closet auto-create?"** → `src/lib/orders/admin-orders.service.ts::transitionOrderStatus`
