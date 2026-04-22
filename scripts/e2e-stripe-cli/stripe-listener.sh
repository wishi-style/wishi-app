#!/usr/bin/env bash
# Forward Stripe test-mode webhooks to the local app. Prints the
# webhook-signing secret — copy into .env.local as STRIPE_WEBHOOK_SECRET
# before starting the app so signature verification passes.
#
# Override FORWARD_URL if the app runs on a non-default port.
set -euo pipefail

FORWARD_URL="${FORWARD_URL:-http://localhost:3000/api/webhooks/stripe}"

echo "[stripe-cli] forwarding to $FORWARD_URL"
echo "[stripe-cli] copy the 'whsec_...' signing secret below into .env.local"
echo

exec stripe listen \
  --forward-to "$FORWARD_URL" \
  --events checkout.session.completed,invoice.payment_succeeded,invoice.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,account.updated,payment_intent.succeeded,transfer.paid,transfer.failed
