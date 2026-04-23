# Runbook

Operational procedures for deploy, rollback, and incident response.
Intended for the on-call engineer (solo founder for v1). Every procedure
starts with "here's what's known good" so you can cross-check state
before touching anything.

## Known-good state

| Thing | Expected |
|---|---|
| Staging ALB | `http://wishi-staging-alb-823228000.us-east-1.elb.amazonaws.com` |
| Health | `/api/health` → `{ ok: true, db: "up" }` |
| ECS web service | `wishi-staging-web`, desired count matches tfvars |
| ECS worker task def | `wishi-staging-worker` registered, no running tasks outside scheduled windows |
| RDS | `wishi-staging-db`, available, <50% CPU in steady state |
| Stripe webhooks | Delivering to `/api/webhooks/stripe` at ≥99% success |
| Klaviyo Events API | Flows triggered by `order.shipped`, `order.arrived`, `gift-card.delivered`, `subscription.retry_failed`, etc. — green in Klaviyo Flows dashboard |
| EasyPost webhooks | Delivering to `/api/webhooks/easypost` at ≥99% success |

## Deploy

### Staging

Pushes to `main` auto-deploy via `.github/workflows/deploy-staging.yml`.
No manual action required. Verify:

```bash
curl https://app.wishi.me/api/health   # or staging URL
gh run list --workflow deploy-staging.yml --limit 3
aws ecs describe-services --cluster wishi-staging --services wishi-staging-web \
  --query "services[0].{running:runningCount,desired:desiredCount,pending:pendingCount}"
```

### Production

Manual via `gh workflow run deploy-production.yml` with required reviewer.
Pre-flight checklist:

1. Staging green for 30+ minutes
2. CloudWatch dashboards showing healthy staging metrics
3. No unresolved CloudWatch alarms
4. Stripe + Clerk + Twilio webhook dashboards at ≥99%
5. Last `terraform plan` shows `No changes. Your infrastructure matches the configuration.`

Monitor the first 10 minutes after cut:

```bash
aws logs tail /ecs/wishi-production-web --follow --since 5m
```

## Rollback

### Web service

Re-deploy the previous task definition revision. No code revert needed.

```bash
# Find the last healthy revision
aws ecs list-task-definitions --family-prefix wishi-production-web \
  --sort DESC --max-items 10

# Roll the service back
aws ecs update-service \
  --cluster wishi-production \
  --service wishi-production-web \
  --task-definition wishi-production-web:<REV>
```

If the problem is in DB migrations, roll the service back first, then
resolve the migration (see "Failed migration" below).

### Failed migration

Prisma migrations are forward-only. If a migration fails mid-apply:

1. **Don't** run `prisma migrate reset` — wipes the DB.
2. Mark the failed migration resolved: `npx prisma migrate resolve --rolled-back <name>`.
3. Revert the offending migration file on a branch, commit the fix, redeploy.
4. If prod data must be preserved and the migration wrote partial rows,
   hand-write a compensating migration.

### Terraform rollback

Re-apply the previous state:

```bash
cd infra
git checkout <last-good-sha> -- modules/ main.tf *.tfvars
terraform plan   # verify the diff is what you expect
terraform apply
git checkout main -- modules/ main.tf *.tfvars  # restore working copy
```

Never `terraform destroy` production modules.

## Incident response

### ALB 5xx > 1% alarm

1. **CloudWatch → ALB target group → Unhealthy hosts count**. If >0, ECS is
   cycling tasks; read `/ecs/wishi-production-web` for the exit reason.
2. If all tasks healthy, check RDS CPU + connections. RDS Proxy exhaustion
   surfaces as 500s.
3. Read the latest error logs: `aws logs tail /ecs/wishi-production-web
   --since 15m --filter-pattern "ERROR"`.
4. Known root causes: bad migration, exhausted Stripe rate limits,
   Twilio outage, Clerk outage.

### Worker queue backup

Scheduled workers run on cron. "Backup" means a worker is failing every
invocation.

1. Check the worker log group: `/ecs/wishi-production-worker`.
2. Fire manually from admin to reproduce: `POST /api/admin/workers/<name>/run`.
3. Common failure: Stripe idempotency-key collision — wait 5 min and retry,
   or shorten the key window.

### RDS failover

RDS Multi-AZ handles this automatically. Expect ~60–120s of 5xx. If longer:

1. `aws rds describe-db-instances --db-instance-identifier wishi-production-db`
2. Force failover: `aws rds reboot-db-instance --db-instance-identifier wishi-production-db --force-failover`
3. If the standby is ALSO unhealthy, escalate to AWS support — do not
   restore from snapshot without approval.

### Clerk outage

All auth fails closed. There's no graceful degradation — the site hard-locks
at sign-in. Action:

1. Post status page update if external.
2. Monitor `https://status.clerk.com`.
3. Nothing to roll back — wait for resolution.

### Inventory service outage

tastegraph inventory is a hard dependency for the board builder's Inventory
tab and the similar-items carousel. The inventory client returns empty
arrays on failure (`src/lib/inventory/inventory-client.ts`), so the UI
degrades gracefully — board builder shows the empty state, carousel hides.

Monitor the inventory service directly. No action on Wishi side beyond
posting a status update.

### Stripe webhook delivery degrading

1. **Stripe Dashboard → Developers → Webhooks** — check delivery success.
2. Replay failed events from the Stripe dashboard, not manually.
3. If webhooks are being rejected at our end, check
   `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret.

### EasyPost webhook misfires

Tracker-based auto-advance depends on EasyPost webhooks reaching us. If
orders aren't advancing SHIPPED → ARRIVED:

1. EasyPost dashboard → Webhooks → delivery status
2. Verify `EASYPOST_WEBHOOK_SECRET` matches EasyPost dashboard value
3. Manual advance is always available: admin → order → status → next

## Soft launch cutover (Phase 11 launch day)

1. Pre-flight (24h out):
   - Staging green for 24h
   - All Phase 11 verification checkboxes in `WISHI-REBUILD-PLAN.md` checked
   - Klaviyo flows live for all `order.*`, `gift-card.*`, `subscription.*` events
   - CloudWatch dashboard loaded; Slack alert channel confirmed
2. T-0:
   - Route 53: create `app.wishi.me` A/ALIAS → production ALB
   - Send invite emails via Klaviyo to the cohort list (20–50 users)
   - Watch live logs + alarms for 2h
3. T+24h check-in:
   - Booking conversion tracked in Mixpanel
   - Zero P0 incidents
   - Zero Stripe webhook failures
4. T+2 to 4 weeks:
   - Flip `wishi.me` apex to the new ALB
   - Drain old platform traffic over 72h
   - Retire old infra

## Mixpanel funnels (launch-day tracking)

Configure these funnels in the Mixpanel UI (Reports → Funnels). Pin the
funnel URLs to the runbook after creation.

| Funnel | Events (in order) |
|---|---|
| **Client acquisition** | `page:/` → `quiz:start` → `quiz:complete` → `match:created` → `booking:completed` |
| **Stylist onboarding** | `stylist:signup` → `onboarding:step_completed` (any) → `onboarding:submitted` → `match_eligible:set` |
| **Session lifecycle** | `session:booked` → `session:activated` → `styleboard:sent` → `styleboard:reviewed` → `session:ended` |
| **Revenue — direct sale** | `cart:item_added` → `checkout:started` → `checkout:succeeded` → `order:arrived` |

Baseline conversion rates captured during Phase 10 staging smoke are in
the cutover ticket — use as the "within 15%" yardstick for the soft
launch success criteria.

## Rollback the cutover

If the cohort reports blocking issues:

1. Pause outbound invite emails in Klaviyo
2. Post status to the cohort via Klaviyo ("we're investigating, old platform still works at wishi.me")
3. Optionally delete the `app.wishi.me` DNS record; `wishi.me` never moved so the old platform remains authoritative
4. Fix, redeploy to staging, re-verify, re-launch to a smaller subset

No user data is lost because the rebuild runs on a fresh database — old
Wishi users on `wishi.me` are unaffected by new-platform incidents.
