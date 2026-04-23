# ADR 0001: Frontend is authoritative (Loveable contract)

**Date:** 2026-04-08
**Status:** Accepted

## Context

The rebuild is being built in parallel: a designer-driven frontend prototype
in Loveable (`smart-spark-craft` repo) and the backend/data model here.
Without a clear authority rule, every scope disagreement ("does this
surface need an email preference toggle?" / "should this card show plan
tier?") becomes a round-trip between the two repos.

## Decision

The Loveable prototype (`smart-spark-craft`) is a **1:1 design contract**.
Backend scope expands to satisfy the UI, never the other way around.
When code in this repo disagrees with the Loveable repo, Loveable wins
and the backend changes.

## Consequences

- Phase 10 (the port) is the moment this contract is enforced: every
  pixel, dialog, and empty state matches Loveable; discrepancies turn
  into backend work.
- When Loveable surfaces a new field (e.g. `Board.profileGender`), we
  add it. When Loveable omits a field the backend has (e.g. capsule
  wardrobe copy), we delete the backend scope.
- Plan prices are owned by the DB (`Plan.priceInCents`), not the Loveable
  JSX hardcodes — prices are the one exception because they change more
  often than the design, and `getPlanPricesForUi()` is the shared
  source of truth.

## Alternatives considered

- **Backend is authoritative** — rejected because the frontend is the
  user's only touch point. Design changes would be bottlenecked on
  backend sign-off.
- **Neither, negotiate each change** — rejected because it's the
  highest-latency option. With a solo founder, any agreement-seeking
  rule is a time sink.
