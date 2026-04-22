# ADR 0003: Build first, migrate later

**Date:** 2026-04 (Phase 0)
**Status:** Accepted

## Context

The old Wishi platform is live at `wishi.me` on an old AWS account. It
has a working user base, subscriptions, and order history. The rebuild
could have taken either of two approaches:

1. Incrementally refactor the old stack in place (Ruby, MongoDB, JS
   monolith) toward the target architecture
2. Build a fresh Next.js 16 + Postgres stack in parallel on new AWS
   infra; keep the old platform running; migrate data after the rebuild
   is stable

## Decision

Build the rebuild as a fresh stack on new AWS infrastructure with a
fresh Postgres database. The old platform stays live unchanged. After
Phase 11 launches to the invite cohort, run migration adapters at
`wishi-app/scripts/migrate-from-legacy/` to backfill historical data.

## Consequences

- The rebuild ships faster — no legacy refactor overhead, no data shape
  compromises in the new schema.
- Old-platform users keep working during the rebuild — zero downtime,
  zero user-visible disruption.
- Soft launch uses a new subdomain (`app.wishi.me`) so the DNS flip
  from old to new is reversible up to the very end.
- Historical orders, sessions, and subscriptions won't exist in the
  new DB until migration adapters run post-launch. UX treats this as
  expected — the new platform starts "empty" for the cohort.
- The old-AWS-account `wishi.me` Route 53 zone migration is a
  separate, deferrable task (doesn't block launch because the invite
  cohort lands on the new subdomain).

## Alternatives considered

- **In-place refactor** — rejected. Solo founder can't maintain the old
  stack and build new features simultaneously. Any bug introduced in
  the legacy code during a partial migration risks the live user base.
- **Blue/green at the DB layer** — rejected as premature optimization
  for a pre-launch rebuild. When the new platform has the same users
  and data, blue/green makes sense; not before.
