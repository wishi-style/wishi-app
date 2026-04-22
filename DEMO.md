# Wishi demo environment

Always-on founder / investor / designer playground. Lives on the staging
deployment. No local setup required, no credentials to share.

## Where

- **URL:** `http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com/demo`
  (will become `https://staging.wishi.me/demo` once DNS moves off the legacy
  AWS account in Phase 11)

## How to run a full flow

1. Open the URL above.
2. In one tab: **Log in as Sasha (Client)**. You land on `/sessions` as a
   pre-onboarded client — style quiz already complete, body profile set,
   match quiz answered (female, minimalist, moderate budget).
3. Book a Mini plan from `/bookings/new`. At Stripe checkout use card
   `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
4. When Stripe redirects back, the webhook fires and the auto-matcher picks
   a stylist. Sasha's preferences align best with **Maya**; Alex is also
   eligible; Jordan is filtered out on gender.
5. Open a private/incognito window and go back to `/demo`. **Log in as Maya
   (Stylist)**. You land on `/stylist/dashboard` and see the new session.
6. Open the session, build a moodboard, send it to Sasha.
7. Back in Sasha's tab: moodboard arrives in chat. Exchange a few messages.
   Maya can send a styleboard, Sasha can tip and rate on end-session.

## Demo accounts

| Who | Role | Notable attributes |
| --- | ---- | ------------------ |
| Sasha | Client | Female, minimalist + classic, moderate budget |
| Maya | Stylist | Female clients only, minimalist + classic, moderate + premium |
| Alex | Stylist | All genders, minimalist + bohemian, moderate + premium |
| Jordan | Stylist | Menswear / non-binary, streetwear + eclectic, premium |

No password is needed — `/demo` uses the existing E2E auth cookie bypass
(`E2E_AUTH_MODE=true`) that's hard-coded off on production by
`isE2EAuthModeEnabled()` in `src/lib/auth/e2e-auth.ts`.

## How the environment resets

A `demo-reset` worker runs nightly at **04:00 UTC**. It deletes every
session, board, message, payment, payout, subscription, order, closet
item and favorite linked to the demo accounts, then leaves the demo users
+ profiles + quiz answers intact so the next morning starts clean.

Manual reset from the admin panel:

```bash
curl -X POST <ALB>/api/admin/workers/demo-reset/run
# (requires an ADMIN-role session — use an admin account or fire it via
# the /admin workers page)
```

## Safety — why this can't leak to production

Two independent gates, either of which blocks production:

1. **`enable_demo_mode` Terraform variable** defaults to `false`. Only
   `infra/staging.tfvars` sets `enable_demo_mode = true`. Production's
   tfvars never sets it, so the ECS task never receives `E2E_AUTH_MODE` or
   `ENABLE_DEMO_SEED`, the seed short-circuits, and the demo-reset
   schedule is never created.
2. **`isE2EAuthModeEnabled()`** returns false whenever `DEPLOYED_ENV ===
   "production"`. The service module sets `DEPLOYED_ENV` to the
   Terraform `var.env` on every env, so even if `E2E_AUTH_MODE` were
   somehow set on production, the `/demo` route would 404 and the E2E
   cookie path would be ignored.

## Known caveats

- **Twilio Conversations is a live service on staging** (not a sandbox).
  Demo chat messages are real Twilio objects and live in the staging
  Twilio account. Fine for founder demos; don't paste anything you
  wouldn't want an on-call engineer to see.
- **Stripe is in test mode.** Only test cards work. No real money moves.
- **Inventory** points at the tastegraph staging service. If you build a
  board and see no inventory items, tastegraph staging is the cause —
  the board builder degrades gracefully.
