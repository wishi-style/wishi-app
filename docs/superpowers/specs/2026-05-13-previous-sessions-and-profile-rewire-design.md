# Previous sessions CTA + profile Items/Looks rewire

## Problem

Two surfaces drift from intent once a session ends:

1. **Sessions list (`/sessions`)** — `SessionCard::deriveStatus` checks for unrated boards *before* checking `session.status`, so a CANCELLED session with a never-rated moodboard still shows a "Review Moodboard" CTA. The card also exposes stage-aware CTAs ("View Details") for terminal states that the client can no longer act on, since chats are closed after a session ends.
2. **Profile (`/profile`)** — when a user finishes a session, they have no way back into the chat to see what the stylist styled. The profile *should* be that record but currently shows an empty "Closet" (manual uploads only) plus a Collections tab that isn't carrying its weight. Looks tab is gated on the user explicitly favoriting a styleboard.

## Goal

For any session in a terminal state, present a single forward-looking action — rebook the same stylist — and move the historical record (items styled with, looks received) into the profile so the user always has access.

## Section A — Sessions list CTA collapse

### Behavior

`/sessions/page.tsx` already partitions sessions into `active` (`BOOKED | ACTIVE | PENDING_END | PENDING_END_APPROVAL | END_DECLINED`) and `completed` (`COMPLETED | CANCELLED | FROZEN | REASSIGNED`). The partitioning is correct and stays.

`SessionCard` short-circuits its CTA-selection logic when `session.status` is one of the four terminal values:

- **CTA label**: `Rebook {stylistFirstName}` (e.g. `Rebook Matthew`).
- **CTA href**: `/stylists/{session.stylist.stylistProfile.id}` when present; fallback `/stylists` (public directory) when the stylist profile id is missing (legacy data, reassigned-from sessions, etc.).
- **Status blurb** (replaces the "last chat message excerpt" for terminal states only):
  - `COMPLETED` → "Session completed."
  - `CANCELLED` → "Session cancelled."
  - `FROZEN` → "Session frozen."
  - `REASSIGNED` → "Session reassigned."
- **Package badge** (MINI / MAJOR / LUX) remains — it is historical fact, not a stage.
- **No stage pill, no "Review Moodboard", no "View Details"** — the existing `new_board` and `closed` branches are skipped entirely for terminal sessions.

Active sessions retain the current CTA logic (board-review, end-session approval, continue chat, etc.) — no changes.

### Files touched

- `src/components/session/session-card.tsx`
  - `deriveStatus()` checks `session.status` first; returns a new `"terminal"` discriminator with `{ statusKind: "completed" | "cancelled" | "frozen" | "reassigned" }`.
  - The render path for terminal status uses the neutral blurb + `Rebook` button.
  - Active-session render path is unchanged.

`src/lib/sessions/queries.ts` does **not** change — including unrated boards in the query is still correct for active sessions, and the card simply ignores them when the parent session is terminal.

## Section B — Profile Items tab rewire

### Behavior

- **Tab strip**: `Items / Looks` (Collections removed).
- **Add Item floating button**: kept. Manual upload + the existing `closet/auto-create.ts` order flow continue to write `ClosetItem` rows.
- **Items grid** sources are unioned and rendered as one list. Filters (Designer / Season / Color) and category sub-tabs (Tops / Bottoms / Dresses / …) operate over the union.

Two source sets:

1. **Closet items** — current `listClosetItems({ userId })`. Includes manual uploads and order-auto-create rows.
2. **Styled inventory items** — `BoardItem`s where:
   - `board.type = 'STYLEBOARD'`
   - `board.sentAt IS NOT NULL`
   - `board.session.clientId = currentUser.id`
   - `boardItem.inventoryProductId IS NOT NULL`
   - resolved to inventory DTOs via the existing `inventory-client.ts` batch path (5-min in-process cache per CLAUDE.md).

**Dedup**: `BoardItem.source` has a single-source CHECK constraint, so closet-sourced and inventory-sourced rows are mutually exclusive — no cross-source dedup is needed. The dedup that *is* needed is **within the styled-inventory feed**: the same `inventoryProductId` can appear on multiple styleboards (revisions, follow-on sessions). One card per unique `inventoryProductId`, attributed to the most recent delivered styleboard that carried it.

**Per-item chip** (colored, subtle, single per card):
- `Closet` — for `ClosetItem` rows. Card behavior unchanged (opens existing closet item detail).
- `Shop` — for styled inventory items. Card retains the inventory item's add-to-cart affordance and click-through to product detail / source styleboard.

Chip styling is a small token-driven pill in `bg-warm-beige` / `bg-cream` ranges — the exact colors land at implementation time using the existing palette so it matches the rest of the surface. No icon, no border.

### Files touched

- `src/app/(client)/profile/page.tsx` — drop `listCollections` import + call; drop Collections tab data prop; add styled-inventory query.
- `src/app/(client)/profile/client.tsx` — remove Collections tab + its sub-views; merge the styled-inventory items into the existing Items grid; render a `Chip` element on each card; route Shop chip clicks to the existing product detail / cart-add flow.
- `src/lib/profile/styled-items.service.ts` (new) — `listStyledInventoryItemsForUser(userId)` returns the resolved DTOs with the dedup applied. Stays small; pure service layer over Prisma + the inventory client.
- `src/lib/collections/collection.service.ts` — left in place for now (no callers remain in `(client)`). Deletion is out of scope; admin tooling may still reference it. Dead-code removal is a follow-up.
- `src/components/profile/profile-tabs.tsx` (or equivalent) — remove Collections tab trigger + panel.
- Any `/profile/collections` sub-route is deleted if present (404 is acceptable).

### Schema

No schema changes. All required data is already on `Board`, `BoardItem`, `Session`, `ClosetItem`.

## Section C — Profile Looks tab rewire

### Behavior

- **Query**: every `Board` where `type = 'STYLEBOARD'` AND `sentAt IS NOT NULL` AND `session.clientId = currentUser.id`. Ordered `sentAt DESC`.
- **Includes revisions** (`isRevision = true`) — each delivered styleboard is a real piece of work and the revision history is a legitimate part of the record.
- **Excludes moodboards** entirely. Moodboards are mid-process artifacts the user already reviewed in-session.
- **Card content**:
  - Composite thumbnail (existing styleboard preview component reused).
  - Caption: `Styled by {stylistFirstName} · {sentAt formatted}`.
  - Click → `/board/{boardId}` (the public SharedBoard view — already lives at this path per the locked Wishi decision).
- **Favorite-state**: the existing favorite affordance on the SharedBoard view continues to work, but a board no longer needs to be favorited to appear here.

### Files touched

- `src/lib/boards/boards.service.ts` (or wherever `listFavoriteBoards` lives) — add `listDeliveredStyleboardsForClient(userId)` that returns the full set ordered by `sentAt`. `listFavoriteBoards` is left in place for other callers (favorite stylists/profile heart UX).
- `src/app/(client)/profile/page.tsx` — replace the `listFavoriteBoards(...).filter(STYLEBOARD)` call with the new service.
- `src/app/(client)/profile/client.tsx` — the Looks panel renders the new list; favorite-only logic is removed.

### Schema

No schema changes.

## Out of scope

- Reviving access to the closed chat. Chats stay closed; the profile is the record.
- Surfacing moodboards anywhere on the profile.
- Cart / checkout UX for `Shop` chip items beyond reusing the existing affordances.
- Migration of historical Collections rows. The table stays; the tab disappears.
- Stylist-side mirror of any of these changes. This spec is client-only.

## Verification

Definition-of-done aligned with `wishi-app/CLAUDE.md`:

- `npm run typecheck` clean.
- `npm run lint` clean.
- `npm test` — at minimum: a unit test for `deriveStatus()` covering all four terminal statuses and the active branch; a service test for `listStyledInventoryItemsForUser` covering dedup; a service test for `listDeliveredStyleboardsForClient` covering ordering + revision inclusion.
- Playwright e2e specs (mandatory per `feedback_playwright_for_major_features.md`):
  - `tests/e2e/sessions-cta.spec.ts` — seed a cancelled session with an unrated moodboard → assert the card renders `Rebook {firstName}` and the neutral status blurb; no `Review Moodboard` button is present.
  - `tests/e2e/profile-items-looks.spec.ts` — seed a delivered styleboard with two inventory items + one closet-sourced item → assert the Items tab shows three rows (two with `Shop` chip, one with `Closet` chip), and the Looks tab shows the styleboard with the correct caption.
- Manual probe with the `matthewcar@wishi.me` populated client account (`reference_matt_user.md`) on staging once merged.

## Notion + docs sync

After merge:
- Flip relevant roadmap item to Done in Notion (DB id in `reference_notion_roadmap.md` auto-memory).
- `WISHI-LAUNCH-PREP.md` — add a line under the matching track if the previous-session UX was tracked there.
- No changes to `CLAUDE.md` locked-decision list unless the chip vocabulary becomes a design system primitive (it's a one-off for now).
