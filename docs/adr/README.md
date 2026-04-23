# Architecture Decision Records

Short records of decisions that shape the codebase. Each ADR is a file
named `<NNNN>-<slug>.md` with sections: Date, Status, Context, Decision,
Consequences, Alternatives considered.

## Why

Code tells you *what*; git log tells you *when*. ADRs tell you *why*
when both are unhelpful — typically a month after the decision, when
the original conversation has compacted out of memory.

## When to add one

- Non-obvious architectural trade-off (we picked X over Y; the next
  reader would plausibly default to Y)
- Cross-cutting constraint that affects more than one module
- A policy that's easy to accidentally regress (e.g. "never hardcode
  plan prices in JSX")

## When **not** to add one

- Implementation detail (pick a name; follow existing patterns)
- Short-lived feature-flag wiring
- A bug fix

## Current records

| ID | Title | Phase |
|---|---|---|
| 0001 | [Frontend is authoritative (Loveable contract)](./0001-frontend-is-authoritative.md) | 10 |
| 0002 | [tastegraph inventory service for product catalog](./0002-tastegraph-inventory.md) | 5 |
| 0003 | [Build first, migrate later](./0003-build-first-migrate-later.md) | 0 |
| 0004 | [Klaviyo Events API + Flows for transactional email](./0004-klaviyo-events-api.md) | 11 |
