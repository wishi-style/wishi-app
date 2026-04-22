# Stripe CLI e2e harness

Drives the full gift-card purchase path end-to-end — real Stripe Checkout
session + real webhook delivery via `stripe listen` + signature verification +
our fulfillment handler. Closes the Phase 11 deferred item "gift-card full
webhook-chain smoke test" and, as a side effect, validates direct-sale,
Buy More Looks, upgrade, and subscription-retry webhooks too (same signing
secret, same delivery path).

## Prerequisites

```bash
stripe --version          # 1.x installed
stripe login              # one-time; persists creds to ~/.config/stripe/
```

Staging Stripe keys in `.env.local`:

```bash
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
# STRIPE_WEBHOOK_SECRET is injected by the listener — leave unset in .env
```

Local Postgres running with the schema applied (same as `npm test` setup):

```bash
docker run -d --name wishi-postgres -p 5432:5432 \
  -e POSTGRES_USER=wishi -e POSTGRES_PASSWORD=password -e POSTGRES_DB=wishi \
  postgres:16-alpine
export DATABASE_URL="postgresql://wishi:password@localhost:5432/wishi?sslmode=disable"
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

## Run

Three terminals. The listener must be running before the flow script
because it prints the signing secret that the app reads at boot.

```bash
# Terminal 1 — forward Stripe webhooks to the local app
./scripts/e2e-stripe-cli/stripe-listener.sh

# Copy the "Your webhook signing secret is whsec_..." line into .env.local
# as STRIPE_WEBHOOK_SECRET, then start the app:

# Terminal 2 — app
PORT=3000 npm run dev

# Terminal 3 — drive the flow
npx tsx scripts/e2e-stripe-cli/gift-card-flow.ts
```

The flow script:

1. Seeds an e2e purchaser user (email-based; cleaned up at exit)
2. Calls `createGiftCardCheckout()` to mint a real Stripe Checkout Session
3. Completes the session via Stripe's test-mode "successful payment"
   simulator (`stripe trigger checkout.session.completed --override ...`)
4. Waits for the webhook → our `/api/webhooks/stripe` → signature
   verification → `applyGiftCardPurchaseFromCheckout`
5. Polls Prisma for the expected rows: 1 `GiftCard`, 2 `PromoCode`
   (SESSION + SHOPPING), 1 `Payment(GIFT_CARD_PURCHASE)`
6. Attempts one redemption of each PromoCode through `redeemPromoCode`
7. Exits 0 on success, 1 with diff on mismatch

## What it catches

- Signature verification broken (`STRIPE_WEBHOOK_SECRET` mismatch)
- Webhook routing regression (`metadata.purpose !== "GIFT_CARD_PURCHASE"`)
- Dual-PromoCode atomicity break (one row created, other missing)
- P2002 idempotency regression (webhook redelivery double-fulfills)
- Klaviyo `gift-card.delivered` event failing to dispatch (surfaced as a
  `[gift-card]` warning in the app log)

## Reusing for other webhook chains

Swap the `stripe trigger` metadata to drive the other purpose flows:

| Purpose | Fixture override | Fulfillment handler |
| --- | --- | --- |
| `GIFT_CARD_PURCHASE` | default | `applyGiftCardPurchaseFromCheckout` |
| `DIRECT_SALE` | `data.object.metadata.purpose=DIRECT_SALE` | `applyDirectSaleFromCheckout` |
| `BUY_MORE_LOOKS` | `data.object.metadata.purpose=BUY_MORE_LOOKS` | `applyBuyMoreLooksFromCheckout` |
| `UPGRADE` | `data.object.metadata.purpose=UPGRADE` | `applyUpgradeFromCheckout` |
| `subscription.retry_failed` | `stripe trigger invoice.payment_failed` | `handleInvoicePaymentFailed` |

Per-purpose flow scripts can be added as `scripts/e2e-stripe-cli/<name>-flow.ts`
following the pattern in `gift-card-flow.ts`.
