# Lighthouse audits

Run desktop-preset Lighthouse against a **production build** (never dev — dev
mode trips unminified-js / source-maps / HMR checks that don't apply in prod).

## Baseline — 2026-04-22 Phase 11 audit

Target: **≥ 90** on Performance, Accessibility, Best Practices, SEO.

| Route | Perf | A11y | Best Practices | SEO |
| --- | --- | --- | --- | --- |
| `/` | 97 | 94 | 77 | 92 |
| `/pricing` | 98 | 94 | 77 | 100 |
| `/how-it-works` | 98 | 94 | 77 | 100 |
| `/lux` | 97 | 96 | 77 | 100 |
| `/stylists` | 100 | 96 | 77 | 100 |
| `/feed` | 99 | 93 | 77 | 100 |

**Perf / A11y / SEO** — meet the ≥ 90 target on every page.

**Best Practices** — 77 across the board. Root cause is entirely third-party
cookies set by Clerk on `*.clerk.accounts.dev` (two cookies: `__cf_bm` is
Cloudflare bot management, `_cfuvid` is Cloudflare's session identifier).
Both are Clerk-owned, set when the Clerk JS runtime loads its environment
and client APIs, and can't be eliminated without moving to Clerk's
satellite-domain / vanity-domain setup (Clerk Pro+ plans). Not a launch
blocker; documented as a post-launch hardening task.

## Running

```bash
# 1. Build + start the app in production mode
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
PORT=3200 HOSTNAME=0.0.0.0 node .next/standalone/server.js &

# 2. Wait for ready + run Lighthouse
for ROUTE in "/" "/pricing" "/how-it-works" "/lux" "/stylists" "/feed"; do
  NAME=$(echo "$ROUTE" | sed 's|/|_|g; s|^_$|home|; s|^_||')
  npx lighthouse "http://localhost:3200$ROUTE" \
    --only-categories=performance,accessibility,best-practices,seo \
    --preset=desktop --chrome-flags="--headless=new --no-sandbox" \
    --output=json --output-path="tests/lighthouse/reports-prod/${NAME}.json" \
    --quiet
done
```

JSON reports land in `tests/lighthouse/reports-prod/` (gitignored). Re-run
before every production deploy and attach the summary delta to the Phase 11
verification ticket.

## When scores regress

Use the [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
reader:

```bash
npx -y @lhci/cli autorun --collect.url=http://localhost:3200/
```

For per-page drill-down, open the JSON in Chrome DevTools → Lighthouse
tab's "Import from URL" / drop-file affordance to get the interactive
flame graph.
