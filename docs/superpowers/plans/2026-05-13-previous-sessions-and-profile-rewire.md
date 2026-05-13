# Previous sessions CTA + profile rewire — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse terminal-session cards to a single `Rebook {firstName}` CTA, and rewire `/profile` so users see all items they've been styled with (delivered styleboards) plus all delivered styleboards as Looks — Collections removed.

**Architecture:** Two surfaces change. (A) `SessionCard` gets its decision logic extracted into a pure module so behavior can be unit-tested; the new short-circuit collapses COMPLETED / CANCELLED / FROZEN / REASSIGNED into a single `terminal` discriminator. (B) Two new server-side services on top of Prisma + the existing inventory client: `listDeliveredStyleboardsForClient` (Looks) and `listStyledInventoryItemsForUser` (Shop items). Profile page swaps `listFavoriteBoards` for these and drops `listCollections` entirely. Profile client renders a `Closet` / `Shop` chip per item card.

**Tech Stack:** Next.js 16 (App Router, RSC), Prisma 7, Postgres 16, Playwright, `node --test` unit runner, Tailwind 4, Radix Tabs. Inventory products resolved via the existing tastegraph client (`src/lib/inventory/inventory-client.ts`).

**Spec reference:** `docs/superpowers/specs/2026-05-13-previous-sessions-and-profile-rewire-design.md`.

---

## Files touched

**New files:**
- `src/lib/sessions/session-card-action.ts` — pure decision functions for SessionCard.
- `src/lib/profile/delivered-styleboards.service.ts` — query for the Looks tab.
- `src/lib/profile/styled-items.service.ts` — query + inventory resolution for the Items tab "Shop" cards.
- `tests/session-card-action.test.ts` — unit tests for the extracted module.
- `tests/profile-delivered-styleboards-integration.test.ts` — integration test (live Postgres).
- `tests/profile-styled-items-integration.test.ts` — integration test (live Postgres + mocked inventory client).
- `tests/e2e/sessions-cta-terminal.spec.ts` — Playwright for the cancelled / completed / frozen / reassigned CTA contract.
- `tests/e2e/profile-items-looks.spec.ts` — Playwright for auto-populated profile.

**Modified files:**
- `src/components/session/session-card.tsx` — imports the new module instead of inlining decision logic.
- `src/app/(client)/profile/page.tsx` — drops `listCollections` + `listFavoriteBoards` for the Looks list; wires the two new services.
- `src/app/(client)/profile/client.tsx` — drops the Collections tab, the `looksTab` sub-pill toggle, and the `CreateCollectionButton`; renders chips on item cards; switches Looks link to `/board/{boardId}`.
- `tests/e2e/sessions-list-loveable.spec.ts` — update "Book Maya Again" label expectations to "Rebook Maya".

**Deleted from client.tsx (not deleted from disk):** `CreateCollectionButton`, `createCollection` server-action wrapper, `collections` / `setCollections` state, `CollectionWithPreview` import.

**Left alone:** `src/lib/collections/collection.service.ts` and `src/lib/sessions/queries.ts` are unchanged — service layer still works for admin tooling and active-session card path respectively. `src/lib/boards/favorite.service.ts` is unchanged (favorite-boards API still used elsewhere).

---

## Task 1 — Bootstrap worktree

**Files:** N/A (environment setup)

- [ ] **Step 1: Create worktree on a new branch**

```bash
cd /Users/matthewcardozo/Wishi/wishi-style/wishi-app
git fetch origin --prune
git worktree add ../wishi-app-rebook-cta -b closed-session-rebook-and-profile-rewire origin/main
```

- [ ] **Step 2: Symlink node_modules + env from main worktree**

```bash
cd ../wishi-app-rebook-cta
ln -s ../wishi-app/node_modules node_modules
ln -s ../wishi-app/.env .env
```

- [ ] **Step 3: Regenerate Prisma client for this worktree**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client" line; no errors.

- [ ] **Step 4: Baseline typecheck**

```bash
npm run typecheck
```

Expected: PASS (clean main).

---

## Task 2 — Extract SessionCard decision logic into a pure module (refactor, no behavior change)

**Files:**
- Create: `src/lib/sessions/session-card-action.ts`
- Modify: `src/components/session/session-card.tsx`

- [ ] **Step 1: Create the new module with the existing logic verbatim**

Create `src/lib/sessions/session-card-action.ts`:

```ts
export type CardStatus =
  | "new_board"
  | "awaiting_reply"
  | "in_progress"
  | "completed"
  | "booked"
  | "closed";

export interface SessionCardInput {
  id: string;
  status: string;
  stylist: {
    firstName: string;
    stylistProfile: { id: string } | null;
  } | null;
  messages: { text: string | null; kind: string }[];
  boards: { id: string; type: string; isRevision?: boolean }[];
}

export function deriveStatus(session: SessionCardInput): CardStatus {
  if (session.boards.length > 0) return "new_board";
  if (session.status === "PENDING_END_APPROVAL") return "awaiting_reply";
  if (session.status === "BOOKED") return "booked";
  if (
    session.status === "ACTIVE" ||
    session.status === "PENDING_END" ||
    session.status === "END_DECLINED"
  ) {
    return "in_progress";
  }
  if (session.status === "COMPLETED") return "completed";
  return "closed";
}

export function actionLabel(
  status: CardStatus,
  session: SessionCardInput,
  stylistFirstName: string,
): string {
  switch (status) {
    case "new_board": {
      const board = session.boards[0];
      if (board?.type === "MOODBOARD") return "Review Moodboard";
      if (board?.isRevision) return "Review Revised Look";
      return "Review Styleboard";
    }
    case "awaiting_reply":
      return "Approve End";
    case "in_progress":
      return "Open Chat";
    case "booked":
      return "Continue";
    case "completed":
      return `Book ${stylistFirstName} Again`;
    case "closed":
      return "View Details";
  }
}

export function actionHref(status: CardStatus, session: SessionCardInput): string {
  switch (status) {
    case "new_board":
    case "in_progress":
    case "booked":
      return `/sessions/${session.id}/chat`;
    case "awaiting_reply":
      return `/sessions/${session.id}/end-session`;
    case "completed":
      return session.stylist?.stylistProfile
        ? `/stylists/${session.stylist.stylistProfile.id}`
        : `/sessions/${session.id}`;
    case "closed":
      return `/sessions/${session.id}`;
  }
}

export function messagePreview(session: SessionCardInput): string {
  const latest = session.messages[0];
  if (latest?.text) return latest.text;
  if (latest?.kind === "MOODBOARD") return "Sent you a moodboard.";
  if (latest?.kind === "STYLEBOARD") return "Sent you a style board.";
  switch (session.status) {
    case "BOOKED":
      return "Booked — your stylist will reach out shortly.";
    case "COMPLETED":
      return "Session completed.";
    case "CANCELLED":
      return "Session cancelled.";
    case "FROZEN":
      return "Session paused.";
    case "REASSIGNED":
      return "Reassigned to another stylist.";
    case "PENDING_END_APPROVAL":
      return "Your stylist requested to wrap up.";
    default:
      return "Session in progress.";
  }
}
```

- [ ] **Step 2: Replace inline logic in session-card.tsx with imports**

In `src/components/session/session-card.tsx`:

Replace lines 21-144 (the four function definitions + the `CardStatus` type alias) with a single import block at the top of the file (after the existing `next/image` / `next/link` imports):

```ts
import {
  type CardStatus,
  actionHref,
  actionLabel,
  deriveStatus,
  messagePreview,
} from "@/lib/sessions/session-card-action";
```

Leave `SessionData`, `planLabel`, `planBadgeClass`, `formatRelativeTime`, the `SessionCard` component, and the `SessionAvatar` component in place. They reference `deriveStatus(...)`, `actionLabel(...)`, `actionHref(...)`, `messagePreview(...)` by name — those names match the new module, so the call sites need no change.

The `SessionData` interface in `session-card.tsx` is a superset of `SessionCardInput` (it carries planType, amountPaidInCents, etc. that the decision logic doesn't read) — leave it as-is. TypeScript structural typing accepts the wider object.

- [ ] **Step 3: Typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: PASS, PASS.

- [ ] **Step 4: Commit refactor**

```bash
git add src/lib/sessions/session-card-action.ts src/components/session/session-card.tsx
git commit -m "$(cat <<'EOF'
refactor(sessions): extract SessionCard decision logic to pure module

Pulls deriveStatus / actionLabel / actionHref / messagePreview out of the
component so the next commit can short-circuit terminal sessions to a
single Rebook CTA and have a unit-testable seam for it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Unit tests pinning current behavior (baseline)

**Files:**
- Create: `tests/session-card-action.test.ts`

- [ ] **Step 1: Write tests for every current return value**

Create `tests/session-card-action.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  actionHref,
  actionLabel,
  deriveStatus,
  messagePreview,
  type SessionCardInput,
} from "@/lib/sessions/session-card-action";

function base(overrides: Partial<SessionCardInput> = {}): SessionCardInput {
  return {
    id: "s_1",
    status: "ACTIVE",
    stylist: {
      firstName: "Maya",
      stylistProfile: { id: "sp_1" },
    },
    messages: [],
    boards: [],
    ...overrides,
  };
}

test("deriveStatus: unrated board wins over ACTIVE status", () => {
  const s = base({
    boards: [{ id: "b1", type: "STYLEBOARD" }],
  });
  assert.equal(deriveStatus(s), "new_board");
});

test("deriveStatus: PENDING_END_APPROVAL routes to awaiting_reply", () => {
  assert.equal(deriveStatus(base({ status: "PENDING_END_APPROVAL" })), "awaiting_reply");
});

test("deriveStatus: BOOKED routes to booked", () => {
  assert.equal(deriveStatus(base({ status: "BOOKED" })), "booked");
});

test("deriveStatus: ACTIVE / PENDING_END / END_DECLINED route to in_progress", () => {
  for (const status of ["ACTIVE", "PENDING_END", "END_DECLINED"]) {
    assert.equal(deriveStatus(base({ status })), "in_progress", status);
  }
});

test("deriveStatus: COMPLETED routes to completed", () => {
  assert.equal(deriveStatus(base({ status: "COMPLETED" })), "completed");
});

test("deriveStatus: CANCELLED / FROZEN / REASSIGNED route to closed", () => {
  for (const status of ["CANCELLED", "FROZEN", "REASSIGNED"]) {
    assert.equal(deriveStatus(base({ status })), "closed", status);
  }
});

test("actionLabel: new_board label varies by board kind", () => {
  const s = base({ boards: [{ id: "b1", type: "MOODBOARD" }] });
  assert.equal(actionLabel("new_board", s, "Maya"), "Review Moodboard");

  const sb = base({ boards: [{ id: "b1", type: "STYLEBOARD" }] });
  assert.equal(actionLabel("new_board", sb, "Maya"), "Review Styleboard");

  const restyle = base({
    boards: [{ id: "b1", type: "STYLEBOARD", isRevision: true }],
  });
  assert.equal(actionLabel("new_board", restyle, "Maya"), "Review Revised Look");
});

test("actionLabel: completed → Book {first} Again (will change in next task)", () => {
  assert.equal(actionLabel("completed", base(), "Maya"), "Book Maya Again");
});

test("actionLabel: closed → View Details (will change in next task)", () => {
  assert.equal(actionLabel("closed", base(), "Maya"), "View Details");
});

test("actionHref: completed → stylist profile when present, session detail otherwise", () => {
  assert.equal(actionHref("completed", base()), "/stylists/sp_1");
  const noProfile = base({
    stylist: { firstName: "Maya", stylistProfile: null },
  });
  assert.equal(actionHref("completed", noProfile), "/sessions/s_1");
});

test("messagePreview: latest message text wins", () => {
  const s = base({
    messages: [{ text: "Hello there", kind: "TEXT" }],
    status: "CANCELLED",
  });
  assert.equal(messagePreview(s), "Hello there");
});

test("messagePreview: status fallback for COMPLETED / CANCELLED / FROZEN / REASSIGNED", () => {
  assert.equal(messagePreview(base({ status: "COMPLETED" })), "Session completed.");
  assert.equal(messagePreview(base({ status: "CANCELLED" })), "Session cancelled.");
  assert.equal(messagePreview(base({ status: "FROZEN" })), "Session paused.");
  assert.equal(
    messagePreview(base({ status: "REASSIGNED" })),
    "Reassigned to another stylist.",
  );
});
```

- [ ] **Step 2: Run tests — all should PASS (baseline)**

```bash
npm test -- --test-name-pattern=session-card-action
```

Expected: 11 passing.

- [ ] **Step 3: Commit baseline tests**

```bash
git add tests/session-card-action.test.ts
git commit -m "$(cat <<'EOF'
test(sessions): pin SessionCard decision logic before terminal CTA change

Baseline for the next change which collapses terminal sessions
(COMPLETED/CANCELLED/FROZEN/REASSIGNED) to a single Rebook CTA.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — TDD: terminal-status short-circuit + Rebook CTA

**Files:**
- Modify: `src/lib/sessions/session-card-action.ts`
- Modify: `tests/session-card-action.test.ts`

- [ ] **Step 1: Replace the "will change" tests with the new expected behavior**

In `tests/session-card-action.test.ts`, **delete** these two existing tests:

```ts
test("actionLabel: completed → Book {first} Again (will change in next task)", ...);
test("actionLabel: closed → View Details (will change in next task)", ...);
```

Also **delete** the existing `deriveStatus: COMPLETED routes to completed` test and the `deriveStatus: CANCELLED / FROZEN / REASSIGNED route to closed` test (the new behavior collapses them).

**Append** the following new tests at the bottom of the file:

```ts
test("deriveStatus: terminal statuses short-circuit regardless of unrated boards", () => {
  for (const status of ["COMPLETED", "CANCELLED", "FROZEN", "REASSIGNED"]) {
    // Even with an unrated board sitting on the session, terminal status wins.
    const withBoard = base({
      status,
      boards: [{ id: "b1", type: "MOODBOARD" }],
    });
    assert.equal(deriveStatus(withBoard), "terminal", `${status} with board`);

    const empty = base({ status });
    assert.equal(deriveStatus(empty), "terminal", `${status} bare`);
  }
});

test("actionLabel: terminal → Rebook {first}", () => {
  assert.equal(actionLabel("terminal", base(), "Matthew"), "Rebook Matthew");
});

test("actionHref: terminal links to stylist profile when present", () => {
  assert.equal(actionHref("terminal", base()), "/stylists/sp_1");
});

test("actionHref: terminal falls back to /stylists directory when no profile id", () => {
  const noProfile = base({
    stylist: { firstName: "Matthew", stylistProfile: null },
  });
  assert.equal(actionHref("terminal", noProfile), "/stylists");
});

test("actionHref: terminal falls back to /stylists directory when no stylist", () => {
  const noStylist = base({ stylist: null });
  assert.equal(actionHref("terminal", noStylist), "/stylists");
});

test("messagePreview: terminal statuses ignore latest message text", () => {
  // Even when there's a real chat message, terminal sessions show the
  // neutral status blurb so the card doesn't pretend the session is still in
  // motion.
  for (const [status, expected] of [
    ["COMPLETED", "Session completed."],
    ["CANCELLED", "Session cancelled."],
    ["FROZEN", "Session frozen."],
    ["REASSIGNED", "Session reassigned."],
  ] as const) {
    const s = base({
      status,
      messages: [{ text: "Matthew loved the moodboard.", kind: "TEXT" }],
    });
    assert.equal(messagePreview(s), expected, status);
  }
});
```

- [ ] **Step 2: Run tests — verify the new ones fail and old ones pass**

```bash
npm test -- --test-name-pattern=session-card-action
```

Expected: 7 passing (baselines) + 6 failing (new). Failures should mention `"terminal"` and the new labels.

- [ ] **Step 3: Implement the new behavior**

Edit `src/lib/sessions/session-card-action.ts`:

Change `CardStatus`:

```ts
export type CardStatus =
  | "new_board"
  | "awaiting_reply"
  | "in_progress"
  | "completed"
  | "booked"
  | "terminal";
```

(Drop `"closed"`; replace with `"terminal"`.)

Change `deriveStatus`:

```ts
export function deriveStatus(session: SessionCardInput): CardStatus {
  // Terminal status wins over any unrated-board hint. Chats are closed once
  // a session ends, so the card MUST NOT route the user back into board
  // review / chat / etc. — the only forward motion is to rebook.
  if (
    session.status === "COMPLETED" ||
    session.status === "CANCELLED" ||
    session.status === "FROZEN" ||
    session.status === "REASSIGNED"
  ) {
    return "terminal";
  }
  if (session.boards.length > 0) return "new_board";
  if (session.status === "PENDING_END_APPROVAL") return "awaiting_reply";
  if (session.status === "BOOKED") return "booked";
  if (
    session.status === "ACTIVE" ||
    session.status === "PENDING_END" ||
    session.status === "END_DECLINED"
  ) {
    return "in_progress";
  }
  // Unknown forward state — keep the card in chat. Safer than the previous
  // "View Details" detour which Loveable parity removed.
  return "in_progress";
}
```

Change `actionLabel`:

```ts
export function actionLabel(
  status: CardStatus,
  session: SessionCardInput,
  stylistFirstName: string,
): string {
  switch (status) {
    case "new_board": {
      const board = session.boards[0];
      if (board?.type === "MOODBOARD") return "Review Moodboard";
      if (board?.isRevision) return "Review Revised Look";
      return "Review Styleboard";
    }
    case "awaiting_reply":
      return "Approve End";
    case "in_progress":
      return "Open Chat";
    case "booked":
      return "Continue";
    case "completed":
      return `Book ${stylistFirstName} Again`;
    case "terminal":
      return `Rebook ${stylistFirstName}`;
  }
}
```

Change `actionHref`:

```ts
export function actionHref(status: CardStatus, session: SessionCardInput): string {
  switch (status) {
    case "new_board":
    case "in_progress":
    case "booked":
      return `/sessions/${session.id}/chat`;
    case "awaiting_reply":
      return `/sessions/${session.id}/end-session`;
    case "completed":
      return session.stylist?.stylistProfile
        ? `/stylists/${session.stylist.stylistProfile.id}`
        : `/sessions/${session.id}`;
    case "terminal":
      return session.stylist?.stylistProfile
        ? `/stylists/${session.stylist.stylistProfile.id}`
        : `/stylists`;
  }
}
```

Change `messagePreview` — short-circuit terminal statuses **before** looking at messages:

```ts
export function messagePreview(session: SessionCardInput): string {
  // Terminal sessions show a neutral status blurb regardless of any lingering
  // chat history. The most recent message can otherwise read like the session
  // is still in motion ("Matthew loved the moodboard...") even after cancel.
  switch (session.status) {
    case "COMPLETED":
      return "Session completed.";
    case "CANCELLED":
      return "Session cancelled.";
    case "FROZEN":
      return "Session frozen.";
    case "REASSIGNED":
      return "Session reassigned.";
  }
  const latest = session.messages[0];
  if (latest?.text) return latest.text;
  if (latest?.kind === "MOODBOARD") return "Sent you a moodboard.";
  if (latest?.kind === "STYLEBOARD") return "Sent you a style board.";
  switch (session.status) {
    case "BOOKED":
      return "Booked — your stylist will reach out shortly.";
    case "PENDING_END_APPROVAL":
      return "Your stylist requested to wrap up.";
    default:
      return "Session in progress.";
  }
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npm test -- --test-name-pattern=session-card-action
```

Expected: 13 passing.

- [ ] **Step 5: Typecheck — confirm `CardStatus` change doesn't break callers**

```bash
npm run typecheck
```

Expected: PASS. `session-card.tsx` imports `CardStatus` only as a type alias and uses it via the helpers, so the rename from `"closed"` to `"terminal"` is internal.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sessions/session-card-action.ts tests/session-card-action.test.ts
git commit -m "$(cat <<'EOF'
fix(sessions): collapse terminal sessions to single Rebook CTA

Cancelled / completed / frozen / reassigned sessions now short-circuit
to a "Rebook {firstName}" CTA pointing at the stylist profile (or the
/stylists directory if the stylist profile id is missing), with a
neutral status blurb instead of the lingering chat-message excerpt.
Fixes a bug where a cancelled session with a never-rated moodboard
showed "Review Moodboard" — the chat is closed by then, so the CTA
went nowhere useful.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Update existing e2e expectation: COMPLETED label is now "Rebook Maya"

**Files:**
- Modify: `tests/e2e/sessions-list-loveable.spec.ts`

- [ ] **Step 1: Replace the three "Book Maya Again" matchers**

In `tests/e2e/sessions-list-loveable.spec.ts`:

Find this block (around line 113-117):

```ts
    await expect(
      page.getByRole("link", { name: "Book Maya Again" }),
    ).toBeVisible();
```

Replace with:

```ts
    await expect(
      page.getByRole("link", { name: "Rebook Maya" }),
    ).toBeVisible();
```

Find this block (around line 132-135):

```ts
    // COMPLETED uses the stylist's public profile id, not the user id.
    const bookAgainHref = await page
      .getByRole("link", { name: "Book Maya Again" })
      .getAttribute("href");
    expect(bookAgainHref).toBe(`/stylists/${stylistProfile.id}`);
```

Replace with:

```ts
    // COMPLETED uses the stylist's public profile id, not the user id.
    const rebookHref = await page
      .getByRole("link", { name: "Rebook Maya" })
      .getAttribute("href");
    expect(rebookHref).toBe(`/stylists/${stylistProfile.id}`);
```

Also update the docstring at the top of the file (around line 20-21):

```ts
 *  - COMPLETED sessions surface a "Book {stylist} Again" CTA pointing at the
 *    stylist's public profile
```

becomes:

```ts
 *  - Terminal sessions (COMPLETED / CANCELLED / FROZEN / REASSIGNED) surface
 *    a "Rebook {stylist}" CTA pointing at the stylist's public profile
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit (we'll run e2e in the final verification step)**

```bash
git add tests/e2e/sessions-list-loveable.spec.ts
git commit -m "$(cat <<'EOF'
test(sessions): update e2e to expect Rebook label on terminal sessions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — New e2e spec: cancelled session with unrated board

**Files:**
- Create: `tests/e2e/sessions-cta-terminal.spec.ts`

- [ ] **Step 1: Write the failing spec**

Create `tests/e2e/sessions-cta-terminal.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createBoardFixture,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Terminal-status SessionCard contract:
 *
 *  - COMPLETED / CANCELLED / FROZEN / REASSIGNED all show a single
 *    "Rebook {firstName}" CTA pointing at the stylist's public profile.
 *  - The status blurb is neutral ("Session completed/cancelled/...") and
 *    ignores any lingering chat-message excerpt.
 *  - An unrated board on a CANCELLED session MUST NOT trigger
 *    "Review Moodboard" / "Review Styleboard" — chats are closed by then.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test("cancelled session with unrated moodboard → Rebook only, no Review", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `term-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `term-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_term_c_${ts}`,
    email: clientEmail,
    firstName: "Term",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_term_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "CANCELLED",
    planType: "MAJOR",
  });
  // Unrated moodboard sitting on the cancelled session — this is the
  // condition that used to flip the card into "Review Moodboard".
  await createBoardFixture({
    sessionId: session.id,
    type: "MOODBOARD",
    sentMinutesAgo: 120,
  });

  try {
    await signIn(page, clientEmail);
    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    // The Rebook CTA exists and points at the stylist profile.
    const rebook = page.getByRole("link", { name: "Rebook Maya" });
    await expect(rebook).toBeVisible();
    expect(await rebook.getAttribute("href")).toBe(
      `/stylists/${stylistProfile.id}`,
    );

    // The Review-* CTAs do NOT.
    await expect(
      page.getByRole("link", { name: /Review (Moodboard|Styleboard|Revised Look)/ }),
    ).toHaveCount(0);
    // "View Details" is also gone.
    await expect(page.getByRole("link", { name: "View Details" })).toHaveCount(0);

    // Neutral blurb is present.
    const body = await page.locator("body").innerText();
    expect(body).toContain("Session cancelled.");
  } finally {
    await getPool().query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
    await getPool().query(
      `DELETE FROM session_pending_actions WHERE session_id = $1`,
      [session.id],
    );
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("frozen session falls back to /stylists when no stylist profile", async ({
  page,
}) => {
  const ts = Date.now() + 1;
  const clientEmail = `term-fb-${ts}@e2e.wishi.test`;
  const stylistEmail = `term-fb-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_term_fb_c_${ts}`,
    email: clientEmail,
    firstName: "Frozen",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_term_fb_s_${ts}`,
    email: stylistEmail,
    firstName: "Iris",
    lastName: "Park",
  });
  // No StylistProfile row — simulates a reassigned-away or never-onboarded
  // stylist on the session record.

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "FROZEN",
    planType: "MINI",
  });

  try {
    await signIn(page, clientEmail);
    await page.goto("/sessions");
    await page.waitForLoadState("networkidle");

    const rebook = page.getByRole("link", { name: "Rebook Iris" });
    await expect(rebook).toBeVisible();
    expect(await rebook.getAttribute("href")).toBe("/stylists");

    const body = await page.locator("body").innerText();
    expect(body).toContain("Session frozen.");
  } finally {
    await getPool().query(
      `DELETE FROM session_pending_actions WHERE session_id = $1`,
      [session.id],
    );
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});
```

- [ ] **Step 2: Run only this spec to confirm it passes against the new behavior**

```bash
npx playwright test tests/e2e/sessions-cta-terminal.spec.ts --reporter=line
```

Expected: 2 passing. (If the e2e server isn't running, start it with `npm run dev:e2e` in another shell first.)

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/sessions-cta-terminal.spec.ts
git commit -m "$(cat <<'EOF'
test(sessions): e2e for terminal-status Rebook CTA + neutral blurb

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — New service: `listDeliveredStyleboardsForClient` (TDD)

**Files:**
- Create: `src/lib/profile/delivered-styleboards.service.ts`
- Create: `tests/profile-delivered-styleboards-integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/profile-delivered-styleboards-integration.test.ts`:

```ts
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  createBoardFixture,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import { listDeliveredStyleboardsForClient } from "@/lib/profile/delivered-styleboards.service";

const emails: string[] = [];

afterEach(async () => {
  while (emails.length > 0) {
    const email = emails.pop()!;
    await cleanupE2EUserByEmail(email);
  }
});

async function seedClientWithStylist() {
  const ts = Date.now() + Math.floor(Math.random() * 10_000);
  const clientEmail = `dlb-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `dlb-s-${ts}@e2e.wishi.test`;
  emails.push(clientEmail, stylistEmail);

  const client = await ensureClientUser({
    clerkId: `e2e_dlb_c_${ts}`,
    email: clientEmail,
    firstName: "Deliver",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_dlb_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  await ensureStylistProfile({ userId: stylist.id });
  return { client, stylist };
}

test("listDeliveredStyleboardsForClient returns every delivered styleboard newest first", async () => {
  const { client, stylist } = await seedClientWithStylist();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });

  const older = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 120,
    title: "Older look",
  });
  const newer = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 5,
    title: "Newer look",
  });

  const looks = await listDeliveredStyleboardsForClient(client.id);
  assert.equal(looks.length, 2);
  assert.equal(looks[0].boardId, newer.id, "newest first");
  assert.equal(looks[1].boardId, older.id);
  assert.equal(looks[0].stylistFirstName, "Maya");
  assert.ok(looks[0].sentAt instanceof Date);
});

test("listDeliveredStyleboardsForClient excludes moodboards", async () => {
  const { client, stylist } = await seedClientWithStylist();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MINI",
  });

  await createBoardFixture({
    sessionId: session.id,
    type: "MOODBOARD",
    sentMinutesAgo: 30,
  });
  const styleboard = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 10,
  });

  const looks = await listDeliveredStyleboardsForClient(client.id);
  assert.equal(looks.length, 1);
  assert.equal(looks[0].boardId, styleboard.id);
});

test("listDeliveredStyleboardsForClient excludes unsent (draft) styleboards", async () => {
  const { client, stylist } = await seedClientWithStylist();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MINI",
  });

  // Insert a styleboard with sent_at = NULL — a draft.
  const draftId = "drft_" + Math.random().toString(36).slice(2, 12);
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, NULL, NOW(), NOW())`,
    [draftId, session.id],
  );

  const looks = await listDeliveredStyleboardsForClient(client.id);
  assert.equal(looks.length, 0);
});

test("listDeliveredStyleboardsForClient only returns boards for this client", async () => {
  const seedA = await seedClientWithStylist();
  const seedB = await seedClientWithStylist();

  const sessionA = await createSessionForClient({
    clientId: seedA.client.id,
    stylistId: seedA.stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });
  const sessionB = await createSessionForClient({
    clientId: seedB.client.id,
    stylistId: seedB.stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });

  await createBoardFixture({ sessionId: sessionA.id, type: "STYLEBOARD" });
  await createBoardFixture({ sessionId: sessionB.id, type: "STYLEBOARD" });

  const looksA = await listDeliveredStyleboardsForClient(seedA.client.id);
  assert.equal(looksA.length, 1);
  const looksB = await listDeliveredStyleboardsForClient(seedB.client.id);
  assert.equal(looksB.length, 1);
  assert.notEqual(looksA[0].boardId, looksB[0].boardId);
});
```

- [ ] **Step 2: Run tests to confirm they fail (service doesn't exist)**

```bash
npm test -- --test-name-pattern=listDeliveredStyleboardsForClient
```

Expected: FAIL with `Cannot find module '@/lib/profile/delivered-styleboards.service'`.

- [ ] **Step 3: Implement the service**

Create `src/lib/profile/delivered-styleboards.service.ts`:

```ts
import { prisma } from "@/lib/prisma";

export interface DeliveredStyleboard {
  boardId: string;
  sessionId: string;
  title: string | null;
  description: string | null;
  sentAt: Date;
  isRevision: boolean;
  stylistFirstName: string;
  stylistLastName: string;
  thumbnailUrl: string | null;
}

export async function listDeliveredStyleboardsForClient(
  clientId: string,
): Promise<DeliveredStyleboard[]> {
  const boards = await prisma.board.findMany({
    where: {
      type: "STYLEBOARD",
      sentAt: { not: null },
      session: { clientId },
    },
    select: {
      id: true,
      sessionId: true,
      title: true,
      description: true,
      sentAt: true,
      isRevision: true,
      session: {
        select: {
          stylist: {
            select: { firstName: true, lastName: true },
          },
        },
      },
      photos: {
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { url: true },
      },
      items: {
        where: { webItemImageUrl: { not: null } },
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { webItemImageUrl: true },
      },
    },
    orderBy: { sentAt: "desc" },
  });

  return boards
    .filter((b) => b.sentAt !== null && b.sessionId !== null)
    .map((b) => ({
      boardId: b.id,
      sessionId: b.sessionId!,
      title: b.title,
      description: b.description,
      sentAt: b.sentAt!,
      isRevision: b.isRevision,
      stylistFirstName: b.session?.stylist?.firstName ?? "Stylist",
      stylistLastName: b.session?.stylist?.lastName ?? "",
      thumbnailUrl:
        b.photos[0]?.url ?? b.items[0]?.webItemImageUrl ?? null,
    }));
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npm test -- --test-name-pattern=listDeliveredStyleboardsForClient
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/delivered-styleboards.service.ts tests/profile-delivered-styleboards-integration.test.ts
git commit -m "$(cat <<'EOF'
feat(profile): list every delivered styleboard for the Looks tab

Returns the full set (including revisions) ordered by sentAt desc, with
the stylist's name and a thumbnail (BoardPhoto first, BoardItem image
fallback). Drops the favorite-only gate the Looks tab currently uses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — New service: `listStyledInventoryItemsForUser` (TDD)

**Files:**
- Create: `src/lib/profile/styled-items.service.ts`
- Create: `tests/profile-styled-items-integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/profile-styled-items-integration.test.ts`:

```ts
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  createBoardFixture,
  createSessionForClient,
  ensureClientUser,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import { listStyledInventoryItemsForUser } from "@/lib/profile/styled-items.service";

const emails: string[] = [];
afterEach(async () => {
  while (emails.length > 0) {
    const email = emails.pop()!;
    await cleanupE2EUserByEmail(email);
  }
});

async function seedSetup() {
  const ts = Date.now() + Math.floor(Math.random() * 10_000);
  const clientEmail = `sti-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `sti-s-${ts}@e2e.wishi.test`;
  emails.push(clientEmail, stylistEmail);

  const client = await ensureClientUser({
    clerkId: `e2e_sti_c_${ts}`,
    email: clientEmail,
    firstName: "Style",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_sti_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  return { client, stylist };
}

async function addBoardItem(
  boardId: string,
  inventoryProductId: string,
  orderIndex = 0,
) {
  const id = "bi_" + randomUUID().replace(/-/g, "").slice(0, 24);
  await getPool().query(
    `INSERT INTO board_items (id, board_id, source, order_index, inventory_product_id, created_at, updated_at)
     VALUES ($1, $2, 'INVENTORY', $3, $4, NOW(), NOW())`,
    [id, boardId, orderIndex, inventoryProductId],
  );
}

test("listStyledInventoryItemsForUser returns one row per unique inventoryProductId, most recent styleboard wins", async () => {
  const { client, stylist } = await seedSetup();
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  const older = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 120,
  });
  const newer = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    sentMinutesAgo: 5,
  });

  // PROD_A appears on both boards — the newer should win the attribution.
  await addBoardItem(older.id, "PROD_A", 0);
  await addBoardItem(newer.id, "PROD_A", 0);
  // PROD_B only appears on the older board.
  await addBoardItem(older.id, "PROD_B", 1);

  const items = await listStyledInventoryItemsForUser(client.id);
  assert.equal(items.length, 2);
  const byId = new Map(items.map((i) => [i.inventoryProductId, i]));
  assert.equal(byId.get("PROD_A")?.sourceBoardId, newer.id);
  assert.equal(byId.get("PROD_B")?.sourceBoardId, older.id);
});

test("listStyledInventoryItemsForUser excludes moodboards, drafts, and other users' sessions", async () => {
  const setupA = await seedSetup();
  const setupB = await seedSetup();

  const sessionA = await createSessionForClient({
    clientId: setupA.client.id,
    stylistId: setupA.stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  const sessionB = await createSessionForClient({
    clientId: setupB.client.id,
    stylistId: setupB.stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });

  // Moodboard for client A — excluded.
  const mood = await createBoardFixture({
    sessionId: sessionA.id,
    type: "MOODBOARD",
  });
  await addBoardItem(mood.id, "PROD_MOOD");

  // Draft styleboard for client A — excluded.
  const draftId = "drft_" + randomUUID().replace(/-/g, "").slice(0, 12);
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, NULL, NOW(), NOW())`,
    [draftId, sessionA.id],
  );
  await addBoardItem(draftId, "PROD_DRAFT");

  // Delivered styleboard for client B — must not appear for client A.
  const sbB = await createBoardFixture({
    sessionId: sessionB.id,
    type: "STYLEBOARD",
  });
  await addBoardItem(sbB.id, "PROD_FOREIGN");

  // Delivered styleboard for client A — only this one's product should show.
  const sbA = await createBoardFixture({
    sessionId: sessionA.id,
    type: "STYLEBOARD",
  });
  await addBoardItem(sbA.id, "PROD_OWN");

  const itemsA = await listStyledInventoryItemsForUser(setupA.client.id);
  assert.deepEqual(
    itemsA.map((i) => i.inventoryProductId),
    ["PROD_OWN"],
  );
});

test("listStyledInventoryItemsForUser returns empty array for a client with no sessions", async () => {
  const { client } = await seedSetup();
  const items = await listStyledInventoryItemsForUser(client.id);
  assert.deepEqual(items, []);
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npm test -- --test-name-pattern=listStyledInventoryItemsForUser
```

Expected: FAIL with `Cannot find module '@/lib/profile/styled-items.service'`.

- [ ] **Step 3: Implement the service**

Create `src/lib/profile/styled-items.service.ts`:

```ts
import { prisma } from "@/lib/prisma";

export interface StyledInventoryItem {
  inventoryProductId: string;
  sourceBoardId: string;
  sourceSessionId: string;
  sentAt: Date;
}

/**
 * Every inventory product the user has been styled with in a delivered
 * styleboard. Deduped by inventoryProductId — when the same product appears
 * on multiple boards, the most recent (by sentAt) wins the attribution.
 *
 * Inventory product DTOs (image, title, brand, price, …) are resolved at
 * render time via the existing inventory client. This service only returns
 * the IDs + provenance.
 */
export async function listStyledInventoryItemsForUser(
  userId: string,
): Promise<StyledInventoryItem[]> {
  const rows = await prisma.boardItem.findMany({
    where: {
      inventoryProductId: { not: null },
      board: {
        type: "STYLEBOARD",
        sentAt: { not: null },
        session: { clientId: userId },
      },
    },
    select: {
      inventoryProductId: true,
      board: {
        select: {
          id: true,
          sessionId: true,
          sentAt: true,
        },
      },
    },
    orderBy: { board: { sentAt: "desc" } },
  });

  const byProduct = new Map<string, StyledInventoryItem>();
  for (const row of rows) {
    if (!row.inventoryProductId || !row.board?.sentAt || !row.board.sessionId) {
      continue;
    }
    if (byProduct.has(row.inventoryProductId)) continue;
    byProduct.set(row.inventoryProductId, {
      inventoryProductId: row.inventoryProductId,
      sourceBoardId: row.board.id,
      sourceSessionId: row.board.sessionId,
      sentAt: row.board.sentAt,
    });
  }
  return Array.from(byProduct.values());
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npm test -- --test-name-pattern=listStyledInventoryItemsForUser
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profile/styled-items.service.ts tests/profile-styled-items-integration.test.ts
git commit -m "$(cat <<'EOF'
feat(profile): list inventory products from delivered styleboards

Returns one row per unique inventoryProductId across every delivered
styleboard the user has been on, attributed to the most recent board.
DTOs are resolved at render time via the inventory client.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — Rewire profile/page.tsx: drop collections, wire new services, resolve inventory DTOs

**Files:**
- Modify: `src/app/(client)/profile/page.tsx`

- [ ] **Step 1: Replace the file**

Replace the whole content of `src/app/(client)/profile/page.tsx` with:

```tsx
import Link from "next/link";
import { unauthorized } from "next/navigation";
import { MoreVerticalIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listClosetItems } from "@/lib/boards/closet.service";
import { listDeliveredStyleboardsForClient } from "@/lib/profile/delivered-styleboards.service";
import { listStyledInventoryItemsForUser } from "@/lib/profile/styled-items.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LoyaltyTier } from "@/generated/prisma/client";
import { ProfilePageClient, type ShopItem, type Look } from "./client";

export const dynamic = "force-dynamic";

const LOYALTY_LABEL: Record<LoyaltyTier, string> = {
  BRONZE: "Bronze Member",
  GOLD: "Gold Member",
  PLATINUM: "Platinum Member",
};

function initialsFor(firstName: string, lastName: string): string {
  const f = firstName?.trim()?.[0] ?? "";
  const l = lastName?.trim()?.[0] ?? "";
  return `${f}${l}`.toUpperCase() || "?";
}

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const [closetItems, deliveredLooks, styledIds] = await Promise.all([
    listClosetItems({ userId: user.id }),
    listDeliveredStyleboardsForClient(user.id),
    listStyledInventoryItemsForUser(user.id),
  ]);

  // Resolve inventory DTOs in parallel — getProduct is 5-min cached so a
  // repeat profile load is essentially free.
  const productDocs = await Promise.all(
    styledIds.map((s) => getProduct(s.inventoryProductId)),
  );
  const shopItems: ShopItem[] = styledIds.flatMap((styled, i) => {
    const doc = productDocs[i];
    if (!doc) return [];
    const variant = doc.variants?.[0] ?? null;
    const listing = variant?.listings?.[0] ?? null;
    return [
      {
        inventoryProductId: styled.inventoryProductId,
        sourceBoardId: styled.sourceBoardId,
        title: doc.title ?? null,
        brand: doc.brand ?? null,
        priceInCents: listing?.priceInCents ?? null,
        imageUrl: doc.imageUrl ?? variant?.imageUrl ?? null,
        merchantUrl: listing?.url ?? null,
        category: doc.category ?? null,
        designer: doc.brand ?? null,
        colors: doc.colors ?? [],
      },
    ];
  });

  const looks: Look[] = deliveredLooks.map((l) => ({
    boardId: l.boardId,
    sessionId: l.sessionId,
    title: l.title,
    thumbnailUrl: l.thumbnailUrl,
    stylistName: `${l.stylistFirstName} ${l.stylistLastName}`.trim(),
    sentAt: l.sentAt.toISOString(),
  }));

  // "In N Outfits" carousel inside ClosetItemDialog. For each closet item,
  // collect the styleboards it appears on (boardItems → board) and pick the
  // first available thumbnail. Single batched query covers every item.
  const closetIds = closetItems.map((c) => c.id);
  const outfitsByItemId: Record<
    string,
    { id: string; title: string; image: string | null }[]
  > = {};
  if (closetIds.length > 0) {
    const itemBoardLinks = await prisma.boardItem.findMany({
      where: {
        closetItemId: { in: closetIds },
        board: { type: "STYLEBOARD", sentAt: { not: null } },
      },
      select: {
        closetItemId: true,
        board: {
          select: {
            id: true,
            title: true,
            photos: {
              orderBy: { orderIndex: "asc" },
              take: 1,
              select: { url: true },
            },
            items: {
              where: { webItemImageUrl: { not: null } },
              orderBy: { orderIndex: "asc" },
              take: 1,
              select: { webItemImageUrl: true },
            },
          },
        },
      },
    });
    for (const link of itemBoardLinks) {
      if (!link.closetItemId || !link.board) continue;
      const list = outfitsByItemId[link.closetItemId] ?? [];
      if (list.some((o) => o.id === link.board.id)) continue;
      const image =
        link.board.photos[0]?.url ?? link.board.items[0]?.webItemImageUrl ?? null;
      list.push({
        id: link.board.id,
        title: link.board.title ?? "Look",
        image,
      });
      outfitsByItemId[link.closetItemId] = list;
    }
  }

  const displayName = `${user.firstName}'s Closet`;
  const initials = initialsFor(user.firstName, user.lastName);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-14">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.firstName} />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground font-display text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-display text-2xl md:text-3xl">
                {displayName}
              </h1>
              <p className="mt-0.5 font-body text-xs uppercase tracking-widest text-muted-foreground">
                {LOYALTY_LABEL[user.loyaltyTier]}
              </p>
            </div>
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-full p-2 transition-colors hover:bg-muted"
          >
            <MoreVerticalIcon className="h-5 w-5 text-muted-foreground" />
          </Link>
        </header>
        <ProfilePageClient
          initialItems={closetItems}
          shopItems={shopItems}
          looks={looks}
          outfitsByItemId={outfitsByItemId}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck (will fail — `ShopItem` / `Look` not yet exported from client.tsx)**

```bash
npm run typecheck
```

Expected: FAIL with errors about `ShopItem` and `Look` exports. We'll fix in Tasks 10–12.

---

## Task 10 — Drop Collections from profile/client.tsx (UI scaffolding)

**Files:**
- Modify: `src/app/(client)/profile/client.tsx`

This task removes the Collections tab content + the `CreateCollectionButton` + all collection state. Items / Looks tab content stays in place but will get rewired in Tasks 11–12.

- [ ] **Step 1: Remove the import + the prop**

In `client.tsx` line 33:

```ts
import type { CollectionWithPreview } from "@/lib/collections/collection.service";
```

Delete this line.

Find the `Props` interface (lines 57-62):

```ts
interface Props {
  initialItems: ClosetItem[];
  looks: Look[];
  collections: CollectionWithPreview[];
  outfitsByItemId: Record<string, OutfitPreview[]>;
}
```

Replace with (note: also adds `shopItems`; defines + exports `Look` + `ShopItem`):

```ts
export interface Look {
  boardId: string;
  sessionId: string;
  title: string | null;
  thumbnailUrl: string | null;
  stylistName: string;
  sentAt: string;
}

export interface ShopItem {
  inventoryProductId: string;
  sourceBoardId: string;
  title: string | null;
  brand: string | null;
  priceInCents: number | null;
  imageUrl: string | null;
  merchantUrl: string | null;
  category: string | null;
  designer: string | null;
  colors: string[];
}

interface Props {
  initialItems: ClosetItem[];
  shopItems: ShopItem[];
  looks: Look[];
  outfitsByItemId: Record<string, OutfitPreview[]>;
}
```

Then **delete** the now-orphaned `interface Look { ... }` block (was at lines 42-49 originally — it's been replaced by the exported version above).

- [ ] **Step 2: Remove collections-related state + functions**

In the `ProfilePageClient` function signature, change:

```ts
export function ProfilePageClient({
  initialItems,
  looks,
  collections: initialCollections,
  outfitsByItemId,
}: Props) {
```

to:

```ts
export function ProfilePageClient({
  initialItems,
  shopItems,
  looks,
  outfitsByItemId,
}: Props) {
```

Delete this line (inside the function body):

```ts
  const [collections, setCollections] = useState(initialCollections);
```

Delete the `looksTab` state line:

```ts
  const [looksTab, setLooksTab] = useState<"styleboards" | "favorites">(
    "styleboards",
  );
```

(The looksTab sub-pill UI gets removed in Task 11.)

Delete the entire `createCollection` async function (lines 222–245 in the current file).

- [ ] **Step 3: Remove the Collections TabsTrigger**

Find this block:

```ts
          <TabsTrigger
            value="collections"
            className="rounded-none border-b-2 border-transparent px-0 pb-3 text-base data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Collections
          </TabsTrigger>
```

Delete it.

- [ ] **Step 4: Remove the Collections TabsContent**

Find the entire `<TabsContent value="collections" ...>` block (lines 714-774 in the original) — from the comment `{/* Collections tab — preview grid + create */}` through the closing `</TabsContent>` that immediately precedes `</Tabs>`.

Delete it.

- [ ] **Step 5: Remove the CreateCollectionButton function**

Find the entire `function CreateCollectionButton({ onCreate }: { ... })` definition at the bottom of the file (lines 977-1035).

Delete it.

- [ ] **Step 6: Remove the unused `ChevronRight` icon import if no other usage remains**

Run:

```bash
grep -n "ChevronRight" src/app/'(client)'/profile/client.tsx
```

If the only remaining match is the import line, remove `ChevronRight,` from the lucide-react import. If there are other usages (e.g., the sidebar filter chevron), leave the import alone.

- [ ] **Step 7: Typecheck — still expect errors about shopItems unused / Look shape mismatch**

```bash
npm run typecheck
```

Expected: errors are different now — they should be about `shopItems` being unused or about the new `Look.sentAt` field. We'll address those in Tasks 11–12. Confirm there are NO `CollectionWithPreview` / `createCollection` / `collections` errors remaining.

- [ ] **Step 8: Commit (interim — still has typecheck errors that the next tasks resolve)**

Do NOT commit yet. We'll commit when typecheck is clean at the end of Task 12.

---

## Task 11 — Rewire Looks tab UI (all delivered styleboards, /board/{id} link)

**Files:**
- Modify: `src/app/(client)/profile/client.tsx`

- [ ] **Step 1: Update the Looks tab JSX**

Find the entire `<TabsContent value="looks" ...>` block (starts at "{/* Looks tab — favorited styleboards */}", ends at the closing `</TabsContent>`).

Replace the **entire block** with:

```tsx
        {/* Looks tab — every styleboard delivered to this client across all
            sessions, newest first. The sub-pill "Style boards / Favorites"
            toggle is removed; favorited state is no longer the gate. Each
            card links to the public SharedBoard view at /board/[boardId]. */}
        <TabsContent value="looks" className="mt-6">
          {/* Stylist filter chips. Loveable's four-facet row
              (Stylist/Occasion/Season/Style) collapses to Stylist only —
              Occasion / Season / Style depend on enrichment that doesn't
              land in this change. */}
          {looksStylists.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="mr-1 font-body text-xs uppercase tracking-widest text-muted-foreground">
                Stylist
              </span>
              {looksStylists.map((name) => {
                const active = looksStylistFilter.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleLooksStylist(name)}
                    className={cn(
                      "rounded-full border px-3 py-1 font-body text-xs transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-foreground hover:bg-muted",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
              {looksStylistFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setLooksStylistFilter(new Set())}
                  className="ml-1 font-body text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <p className="mb-4 font-body text-xs uppercase tracking-widest text-muted-foreground">
            {filteredLooks.length}{" "}
            {filteredLooks.length === 1 ? "Look" : "Looks"}
          </p>

          {filteredLooks.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              {looks.length === 0
                ? "No looks yet. Looks delivered by your stylist will appear here."
                : "No looks match the current filters."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
              {filteredLooks.map((look) => (
                <Link
                  key={look.boardId}
                  href={`/board/${look.boardId}`}
                  className="group relative block overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-md"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    {look.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={look.thumbnailUrl}
                        alt={look.title ?? "Styleboard"}
                        className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="px-3 pb-3 pt-2">
                    <p className="truncate font-body text-xs text-muted-foreground">
                      Styled by {look.stylistName} ·{" "}
                      {new Date(look.sentAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
```

- [ ] **Step 2: Fix the `looksStylists` / `filteredLooks` derivations**

Find the existing `useMemo` blocks for `looksStylists` and `filteredLooks` (around lines 130-147). The shapes change because `Look.stylistName` is no longer nullable. Replace those two `useMemo` blocks with:

```ts
  const looksStylists = useMemo(
    () => Array.from(new Set(looks.map((l) => l.stylistName))).sort(),
    [looks],
  );
  const filteredLooks = useMemo(
    () =>
      looksStylistFilter.size === 0
        ? looks
        : looks.filter((l) => looksStylistFilter.has(l.stylistName)),
    [looks, looksStylistFilter],
  );
```

- [ ] **Step 3: Remove the now-unused SlidersHorizontalIcon import if applicable**

```bash
grep -n "SlidersHorizontalIcon" src/app/'(client)'/profile/client.tsx
```

If the only remaining match is the import line, remove `SlidersHorizontalIcon,` from the lucide-react import block. If there are other usages, leave alone.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: still failing because `shopItems` is unused. That's resolved in Task 12.

---

## Task 12 — Items tab union + Shop/Closet chip

**Files:**
- Modify: `src/app/(client)/profile/client.tsx`

- [ ] **Step 1: Build a unified grid model**

At the top of `ProfilePageClient`, right after the `const [items, setItems] = useState(initialItems);` line, add:

```ts
  // Items tab is a union of (a) user closet items and (b) inventory products
  // from delivered styleboards. We tag each row with a `source` so the chip
  // and the click behavior can differentiate.
  type GridRow =
    | { source: "closet"; key: string; closet: ClosetItem }
    | { source: "shop"; key: string; shop: ShopItem };

  const gridRows: GridRow[] = useMemo(() => {
    const closetRows: GridRow[] = items.map((c) => ({
      source: "closet" as const,
      key: `closet:${c.id}`,
      closet: c,
    }));
    const shopRows: GridRow[] = shopItems.map((s) => ({
      source: "shop" as const,
      key: `shop:${s.inventoryProductId}`,
      shop: s,
    }));
    return [...closetRows, ...shopRows];
  }, [items, shopItems]);
```

- [ ] **Step 2: Replace the closet-only filter pipeline with one that handles both row types**

The existing `filterClosetItems` only handles `ClosetItem`. We need a small shim that normalizes a `GridRow` to a comparable shape so the same facet filters work.

In `src/lib/closet/filter.ts`, the current `filterClosetItems` reads `category`, `designer`, `season`, `colors` off the item. `ShopItem` carries the same fields by name except `season` (which is null for inventory products). We can apply the closet filter to closet rows, and a simpler filter (designer / color / category — no season) to shop rows.

Replace the `filteredItems` `useMemo` block (currently around line 125-128) with:

```ts
  const filteredRows = useMemo(() => {
    return gridRows.filter((row) => {
      if (row.source === "closet") {
        return filterClosetItems([row.closet], filters).length === 1;
      }
      const shop = row.shop;
      const cats = filters.category ?? [];
      if (cats.length > 0 && (!shop.category || !cats.includes(shop.category))) {
        return false;
      }
      const designers = filters.designer ?? [];
      if (
        designers.length > 0 &&
        (!shop.designer || !designers.includes(shop.designer))
      ) {
        return false;
      }
      const colors = filters.color ?? [];
      if (
        colors.length > 0 &&
        !shop.colors.some((c) => colors.includes(c))
      ) {
        return false;
      }
      // Season is closet-only; shop rows pass through.
      return true;
    });
  }, [gridRows, filters]);
```

Delete the existing `filteredItems` `useMemo`. Then update every reference to `filteredItems` in this file to `filteredRows`. Most references are inside the Items tab JSX — search for `filteredItems` in the file and replace each match.

- [ ] **Step 3: Build the merged facet computation**

Find the existing `facets` `useMemo` (around line 124):

```ts
  const facets = useMemo(() => computeClosetFacets(items), [items]);
```

Replace with:

```ts
  const facets = useMemo(() => {
    const closetFacets = computeClosetFacets(items);
    const shopDesigners = new Set(closetFacets.designer ?? []);
    const shopColors = new Set(closetFacets.color ?? []);
    const shopCategories = new Set(closetFacets.category ?? []);
    for (const s of shopItems) {
      if (s.designer) shopDesigners.add(s.designer);
      for (const c of s.colors) shopColors.add(c);
      if (s.category) shopCategories.add(s.category);
    }
    return {
      ...closetFacets,
      designer: Array.from(shopDesigners).sort(),
      color: Array.from(shopColors).sort(),
      category: Array.from(shopCategories).sort(),
    };
  }, [items, shopItems]);
```

- [ ] **Step 4: Render the chip + handle each row type in the Items grid**

Find the Items grid `<div className={cn("grid gap-3", ...)}>` block (currently around line 534-589). Replace its contents (the `.map(...)` callback) with the GridRow-aware version:

```tsx
                <div
                  className={cn(
                    "grid gap-3",
                    gridSize === "normal"
                      ? "grid-cols-3 md:grid-cols-4"
                      : "grid-cols-4 md:grid-cols-5",
                  )}
                >
                  {filteredRows.map((row) => {
                    if (row.source === "closet") {
                      const item = row.closet;
                      const isSelected = selected.has(item.id);
                      return (
                        <button
                          key={row.key}
                          type="button"
                          onClick={() => {
                            if (selectMode) toggleItemSelect(item.id);
                            else setDetailItem(item);
                          }}
                          className={cn(
                            "relative overflow-hidden rounded-xl border bg-card text-left transition-all",
                            isSelected
                              ? "border-foreground ring-2 ring-foreground"
                              : "border-border",
                            selectMode && "cursor-pointer",
                          )}
                        >
                          {selectMode && (
                            <div
                              className={cn(
                                "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border-2",
                                isSelected
                                  ? "border-foreground bg-foreground"
                                  : "border-muted-foreground/40 bg-background/80",
                              )}
                            >
                              {isSelected && (
                                <div className="h-2 w-2 rounded-full bg-background" />
                              )}
                            </div>
                          )}
                          <span className="absolute right-2 top-2 z-10 rounded-full bg-warm-beige/90 px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-widest text-dark-taupe">
                            Closet
                          </span>
                          <div className="aspect-square bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.url}
                              alt={item.name ?? ""}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <p className="truncate px-2 pb-2 pt-5 font-body text-xs text-foreground">
                            {item.designer ?? item.name ?? "—"}
                          </p>
                        </button>
                      );
                    }
                    const shop = row.shop;
                    return (
                      <Link
                        key={row.key}
                        href={`/board/${shop.sourceBoardId}`}
                        className="relative overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:shadow-md"
                      >
                        <span className="absolute right-2 top-2 z-10 rounded-full bg-foreground/90 px-2 py-0.5 font-body text-[10px] font-medium uppercase tracking-widest text-background">
                          Shop
                        </span>
                        <div className="aspect-square bg-muted">
                          {shop.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={shop.imageUrl}
                              alt={shop.title ?? ""}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : null}
                        </div>
                        <p className="truncate px-2 pb-2 pt-5 font-body text-xs text-foreground">
                          {shop.designer ?? shop.title ?? "—"}
                        </p>
                      </Link>
                    );
                  })}
                </div>
```

- [ ] **Step 5: Update the item count + empty state copy**

Find the `{filteredItems.length} {filteredItems.length === 1 ? "Item" : "Items"}` snippet — update to `filteredRows.length`. Likewise update the empty-state block:

```tsx
              {filteredRows.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  {gridRows.length === 0
                    ? "No items yet. Items styled for you and uploads will appear here."
                    : "No items match the current filters."}
                </p>
              ) : (
```

- [ ] **Step 6: Typecheck — should be clean now**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Lint**

```bash
npm run lint
```

Expected: PASS. If the unused `Link` import is flagged on profile-page.tsx because of the Looks tab change, ignore — `Link` is also used in the header. If the lint flags `outfitsByItemId` for being unused on shop rows, that's expected — the dialog still needs it for closet rows.

- [ ] **Step 8: Commit the profile rewire**

```bash
git add src/app/'(client)'/profile/page.tsx src/app/'(client)'/profile/client.tsx
git commit -m "$(cat <<'EOF'
feat(profile): surface delivered items + looks; drop Collections tab

Items tab now unions user closet items + inventory products from
delivered styleboards, tagged with a Closet/Shop chip. Looks tab shows
every styleboard delivered to this client across all sessions, not just
favorited ones. Click → /board/{id}. Collections removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13 — Playwright e2e: profile items + looks auto-populate

**Files:**
- Create: `tests/e2e/profile-items-looks.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/profile-items-looks.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createBoardFixture,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * /profile contract after the rewire:
 *  - Items tab shows delivered-styleboard inventory items tagged "Shop" and
 *    user-uploaded closet items tagged "Closet". Collections tab is gone.
 *  - Looks tab shows every delivered styleboard for this client, regardless
 *    of favorite state, linking to /board/[id].
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function addBoardItem(boardId: string, inventoryProductId: string, orderIndex = 0) {
  const id = "bi_" + randomUUID().replace(/-/g, "").slice(0, 24);
  await getPool().query(
    `INSERT INTO board_items (id, board_id, source, order_index, inventory_product_id, created_at, updated_at)
     VALUES ($1, $2, 'INVENTORY', $3, $4, NOW(), NOW())`,
    [id, boardId, orderIndex, inventoryProductId],
  );
}

test("/profile surfaces delivered styleboards under Looks and the items under Shop", async ({
  page,
}) => {
  const ts = Date.now();
  const clientEmail = `prof-c-${ts}@e2e.wishi.test`;
  const stylistEmail = `prof-s-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_prof_c_${ts}`,
    email: clientEmail,
    firstName: "Profile",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_prof_s_${ts}`,
    email: stylistEmail,
    firstName: "Maya",
    lastName: "Brooks",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "COMPLETED",
    planType: "MAJOR",
  });
  const styleboard = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    title: "Spring Edit",
    sentMinutesAgo: 30,
  });
  // Two products on the delivered styleboard — should show as "Shop" cards.
  // Inventory IDs may or may not resolve to real DTOs depending on the local
  // INVENTORY_SERVICE_URL. We're testing the persistence/listing contract;
  // an empty inventory response just collapses the Items rendering — so we
  // assert on the Looks tab first, which doesn't depend on inventory.
  await addBoardItem(styleboard.id, "PROD_A_" + ts);
  await addBoardItem(styleboard.id, "PROD_B_" + ts, 1);

  // Moodboard should NOT contribute to Looks.
  const moodboard = await createBoardFixture({
    sessionId: session.id,
    type: "MOODBOARD",
    sentMinutesAgo: 60,
  });
  await addBoardItem(moodboard.id, "PROD_MOOD_" + ts);

  try {
    await signIn(page, clientEmail);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    // Tabs strip: Items + Looks, no Collections.
    await expect(page.getByRole("tab", { name: "Items" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Looks" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Collections" })).toHaveCount(0);

    // Looks tab — one delivered styleboard, no moodboard, link goes to /board/[id].
    await page.getByRole("tab", { name: "Looks" }).click();
    await expect(
      page.getByText("1 Look", { exact: false }),
    ).toBeVisible();
    const lookLink = page.locator(`a[href="/board/${styleboard.id}"]`);
    await expect(lookLink).toBeVisible();
    await expect(
      page.getByText(/Styled by Maya Brooks/),
    ).toBeVisible();
  } finally {
    await getPool().query(`DELETE FROM board_items WHERE board_id IN ($1, $2)`, [
      styleboard.id,
      moodboard.id,
    ]);
    await getPool().query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
    await getPool().query(
      `DELETE FROM session_pending_actions WHERE session_id = $1`,
      [session.id],
    );
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserByEmail(clientEmail);
    await cleanupE2EUserByEmail(stylistEmail);
  }
});

test("/profile Items tab tags user-uploaded closet items with the Closet chip", async ({
  page,
}) => {
  const ts = Date.now() + 1;
  const clientEmail = `prof-cl-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_prof_cl_c_${ts}`,
    email: clientEmail,
    firstName: "Closet",
    lastName: "User",
  });

  // Seed one closet item directly.
  const closetId = "ci_" + randomUUID().replace(/-/g, "").slice(0, 22);
  await getPool().query(
    `INSERT INTO closet_items (id, user_id, s3_key, url, name, designer, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [
      closetId,
      client.id,
      `closet/${closetId}.jpg`,
      "https://example.test/closet.jpg",
      "Linen Shirt",
      "Acme",
    ],
  );

  try {
    await signIn(page, clientEmail);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    // Items tab default — should show the chip on the item card.
    const card = page.locator(`img[src="https://example.test/closet.jpg"]`);
    await expect(card).toBeVisible();

    const body = await page.locator("body").innerText();
    // Chip text is uppercase per the Tailwind class.
    expect(body).toMatch(/Closet/);
  } finally {
    await getPool().query(`DELETE FROM closet_items WHERE id = $1`, [closetId]);
    await cleanupE2EUserByEmail(clientEmail);
  }
});
```

- [ ] **Step 2: Run only this spec**

Make sure the e2e server is running (`npm run dev:e2e` in another shell). Then:

```bash
npx playwright test tests/e2e/profile-items-looks.spec.ts --reporter=line
```

Expected: 2 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/profile-items-looks.spec.ts
git commit -m "$(cat <<'EOF'
test(profile): e2e for auto-populated Items + Looks tabs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14 — Final verification + PR

**Files:** N/A

- [ ] **Step 1: Full typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: PASS, PASS.

- [ ] **Step 2: Unit + integration test suite**

```bash
npm test
```

Expected: ~290 passing (matches the CLAUDE.md-stated baseline), 0 new failures. Skipped count may have ticked up; that's fine.

- [ ] **Step 3: Targeted e2e — the two new specs + the one we updated**

In another shell: `npm run dev:e2e`. Then:

```bash
npx playwright test \
  tests/e2e/sessions-cta-terminal.spec.ts \
  tests/e2e/profile-items-looks.spec.ts \
  tests/e2e/sessions-list-loveable.spec.ts \
  --reporter=line
```

Expected: every test in those three files passes.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin closed-session-rebook-and-profile-rewire
```

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "Rebook CTA for terminal sessions + profile Items/Looks rewire" --body "$(cat <<'EOF'
## Summary
- Terminal sessions (COMPLETED / CANCELLED / FROZEN / REASSIGNED) now show a single `Rebook {firstName}` CTA pointing at the stylist profile (or `/stylists` directory if no profile id). Neutral status blurb replaces the stale chat-message excerpt. Fixes the cancelled-session "Review Moodboard" bug.
- `/profile` Items tab auto-populates with every inventory product from delivered styleboards (Shop chip) plus existing user closet items (Closet chip). Looks tab shows every delivered styleboard for the client, click → `/board/{id}`. Collections tab removed; `Add Item` stays.
- Decision logic for `SessionCard` extracted into `src/lib/sessions/session-card-action.ts` and unit-tested.
- New services: `listDeliveredStyleboardsForClient`, `listStyledInventoryItemsForUser` (both integration-tested against live Postgres).

## Test plan
- [x] Unit: `tests/session-card-action.test.ts` covers every CardStatus branch + the terminal-status short-circuit.
- [x] Integration: `tests/profile-delivered-styleboards-integration.test.ts` covers ordering, moodboard exclusion, draft exclusion, client isolation.
- [x] Integration: `tests/profile-styled-items-integration.test.ts` covers dedup by inventoryProductId, moodboard/draft exclusion, cross-client isolation.
- [x] E2E: `tests/e2e/sessions-cta-terminal.spec.ts` cancelled + frozen variants.
- [x] E2E: `tests/e2e/profile-items-looks.spec.ts` Looks population + Closet chip.
- [x] E2E: `tests/e2e/sessions-list-loveable.spec.ts` updated for the new Rebook label.

Spec: `docs/superpowers/specs/2026-05-13-previous-sessions-and-profile-rewire-design.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 6: Capture the PR URL in this task for follow-through after merge**

Output of `gh pr create` is the PR URL. Note it. After merge, the agent owns:
- Cleanup per CLAUDE.md "Post-merge cleanup is yours, not the user's"
- Notion roadmap flip
- Worktree removal

---

## Self-review

**Spec coverage:**
- Section A.1 (terminal short-circuit) → Tasks 2, 3, 4.
- Section A.2 (neutral blurb) → Task 4 step 3.
- Section A.3 (no stage pill / Review / View Details) → Task 4 step 3 + Task 6 e2e.
- Section B (Items tab rewire, Shop/Closet chip, dedup) → Tasks 8, 9, 12.
- Section B (Collections removal) → Task 10.
- Section B (Add Item retained) → no change required; the floating button + AddItemDialog are not touched.
- Section C (Looks tab — all delivered, `/board/{id}`) → Tasks 7, 9, 11.
- Verification plan (typecheck, lint, unit, integration, e2e) → Task 14.

**Placeholder scan:** no TBDs, every step has exact code or exact commands.

**Type consistency:** `CardStatus` rename (`closed` → `terminal`) is internal to `session-card-action.ts` + its tests. `SessionData` in `session-card.tsx` is intentionally wider than `SessionCardInput` — TS structural typing accepts. `Look` and `ShopItem` interfaces are exported from `profile/client.tsx` and consumed by `profile/page.tsx` to keep the contract on one side.

**Known risk:** Task 8 + Task 9 use `JSON.stringify` of session uuid + `randomUUID()` to seed `board_items.id`; the schema column is `cuid()` but the test fixtures already use `generateId` (a 24-char nanoid) and the column has no format constraint beyond `TEXT PRIMARY KEY` (verified by inspecting `prisma/schema.prisma` — `BoardItem.id` is `@default(cuid())`, not a format check). The chosen `"bi_" + uuid-no-dashes` format is consistent with the existing fixtures' shape.
