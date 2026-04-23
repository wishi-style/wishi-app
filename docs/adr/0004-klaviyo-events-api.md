# ADR 0004: Klaviyo Events API + Flows for transactional email

**Date:** 2026-04-22 (Phase 11)
**Status:** Accepted

## Context

Phase 11 needs transactional email delivery for order shipped/arrived,
return initiated, gift-card delivered, subscription retry failed, etc.
The team doesn't have a dedicated email engineer. Copy iterates weekly.

Klaviyo offers two integration patterns:

1. **Template API** — code references a specific template ID and passes
   merge variables. Changing copy requires a code deploy (or a template
   lookup table that still ships in code).
2. **Events API + Flows** — code posts a custom event with properties.
   The Klaviyo UI configures a Flow that picks the event, selects a
   template, and dispatches. Copy iterates in the Klaviyo UI, no deploy.

## Decision

Use the Events API + Flows pattern. Every transactional notification
becomes a `createEvent` call with a humanized metric name (e.g.
`order.shipped` → "Order Shipped") and a properties payload. Klaviyo
Flows in the UI own the template-to-event mapping.

## Consequences

- Copy changes are zero-deploy — marketer (or founder) edits the Flow
  template, publishes, done.
- No template IDs in source. The only code-side coupling is the event
  name; if we rename an event, Flows must update too (coordinated
  change, caught in staging).
- Rich properties enable template personalization without schema
  changes — e.g. adding `firstItemImageUrl` to `order.shipped`
  immediately lets the template render a product thumbnail.
- Cost per email is the standard Klaviyo rate; no additional invoice.
- The Wishi-user-less path (gift-card recipient) uses the same API
  via `src/lib/notifications/transactional.ts` — Klaviyo accepts a
  bare email profile, no external_id required.

## Alternatives considered

- **Template API with a lookup table** — rejected. Every copy tweak
  still requires a PR, CI, and deploy. Same constraint as hardcoded IDs.
- **Resend / Postmark** — rejected. Both are strong transactional-only
  providers but lack Klaviyo's Flow-based authoring. Wishi already uses
  Klaviyo for marketing, so consolidating to one vendor removes a
  billing/UX seam.
