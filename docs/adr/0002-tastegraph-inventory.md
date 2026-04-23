# ADR 0002: Use tastegraph inventory service for product catalog

**Date:** 2026-04 (Phase 5)
**Status:** Accepted

## Context

Wishi needs a product catalog for the styling room's Inventory tab,
board builder, and Similar Items carousel. Options were:

1. Build + maintain a local Prisma Product model + ingest pipeline
2. Use the existing tastegraph/ai-stylist-platform inventory service as
   an internal dependency
3. Use a third-party catalog (Shopify, Commerce.js)

## Decision

Proxy the tastegraph inventory service. Store only `inventoryProductId`
strings in local tables — no local Product model.

`src/lib/inventory/inventory-client.ts` is the single proxy point. It
caches responses for 5 minutes and returns empty arrays on failure so
the Inventory tab degrades gracefully.

## Consequences

- Zero product-catalog maintenance on the Wishi side — tastegraph owns
  crawling, normalization, embedding (Cohere Embed v4, 1024-dim),
  pgvector HNSW index, and retailer affiliate relationships.
- Similar Items (Phase 7 feature 5) is an inventory-service proxy, not
  an LLM call on our side.
- Products rendered in UI resolve via `/api/products/[id]` at render time
  — requires careful loading states on high-fan-out views (PDP carousel,
  board builder).
- Hard dependency: when tastegraph is down, the Inventory tab and
  Similar Items hide. Runbook covers the failure mode.

## Alternatives considered

- **Local Product model** — rejected. Product catalog ingest is
  multi-month engineering work and duplicates tastegraph's existing
  investment.
- **Shopify / Commerce.js** — rejected. Neither offers the semantic
  search + styling-adjacent curation that tastegraph owns.
