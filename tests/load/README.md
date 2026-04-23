# Load tests

[k6](https://k6.io) scenarios that exercise the launch-critical paths on staging
under the Phase 11 target: **100 concurrent sessions sustained for 10 minutes,
p99 < 1s for cached pages, p99 < 3s for dynamic pages.**

## Prerequisites

```bash
brew install k6   # or the k6 install for your OS
```

Point `BASE_URL` at the environment you want to hit. Staging is the
default target — never run against production.

```bash
export BASE_URL=https://app.wishi.me   # staging URL
```

## Running

Each scenario is a standalone k6 script. Use the shortcuts in `package.json`:

```bash
npm run test:load                  # runs the marketing ramp scenario
npm run test:load:feed             # /api/feed cursor pagination burst
npm run test:load:checkout         # authed checkout burst (see auth note)
```

Or invoke k6 directly for ad-hoc runs:

```bash
k6 run tests/load/marketing.js -e BASE_URL=$BASE_URL
```

## Scenarios

| Script | Users | Duration | Traffic pattern |
| --- | --- | --- | --- |
| `marketing.js` | ramp to 100 | ~12 min | Rotate through `/`, `/pricing`, `/how-it-works`, `/lux`, `/stylists`, `/feed`. Covers the Cache Components surface. |
| `feed-api.js` | 50 | 5 min | Cursor-paginated `/api/feed` calls. Verifies the feed query scales under concurrent pagination. |
| `checkout-burst.js` | 10 | 2 min | Authenticated cart → Stripe Checkout session creation. **Requires** an E2E test user cookie (`E2E_CLERK_ID_COOKIE`) with a non-empty cart. |

## Thresholds

Shared `tests/load/thresholds.js` exports the Phase 11 launch targets so
every scenario enforces them consistently. A run fails CI when any threshold
breaches.

- **Cached pages (marketing):** p95 < 500ms, p99 < 1s, error rate < 0.5%
- **Dynamic pages (feed, authed):** p95 < 1.5s, p99 < 3s, error rate < 1%

## Interpreting results

k6 prints a summary with p50/p90/p95/p99 latencies per check + whether
thresholds passed. Export JSON for archival:

```bash
k6 run --summary-export tests/load/results/marketing-$(date +%s).json \
  tests/load/marketing.js
```

Store results under `tests/load/results/` (gitignored) and attach the
JSON + a screenshot of the CloudWatch dashboard to the Phase 11
verification runbook entry.
