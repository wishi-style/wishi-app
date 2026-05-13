# Real Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Purge Loveable mock notifications, persist real `Notification` rows for every dispatcher event, wire bell + sonner toast on both stylist and client surfaces with 10s polling, add Twilio SMS for 8 high-value events, remove Web Push entirely.

**Architecture:** New `Notification` Prisma model written by `dispatchNotification()` as the first fan-out step (fail-fast). Email + SMS are best-effort siblings. Single `useNotifications()` hook drives bell + toast via 10s `GET /api/notifications` polling, with first-fetch baseline so backlog doesn't blast users. One `NotificationsPopover` component mounts on both `SiteHeader` (client, between My Style Sessions and cart) and stylist top bar / dashboard.

**Tech Stack:** Prisma 7, Next.js 16 App Router, Twilio SDK (existing), sonner v2 (already mounted in `src/app/layout.tsx`), `node:test` for unit/integration, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-05-13-real-notifications-design.md`

---

## File map

**New files:**
- `prisma/migrations/<ts>_add_notifications_drop_push_subscriptions/migration.sql`
- `src/lib/notifications/event-meta.ts`
- `src/lib/notifications/format.ts`
- `src/lib/notifications/sms.ts`
- `src/lib/notifications/sms-templates.ts`
- `src/lib/notifications/use-notifications.ts`
- `src/components/notifications/notifications-popover.tsx`
- `src/app/api/notifications/route.ts`
- `src/app/api/notifications/[id]/read/route.ts`
- `src/app/api/notifications/read-all/route.ts`
- `tests/notification-event-meta.test.ts`
- `tests/notifications-sms.test.ts`
- `tests/notifications-dispatcher.test.ts`
- `tests/notifications-format.test.ts`
- `tests/e2e/stylist-notifications.spec.ts`
- `tests/e2e/client-notifications.spec.ts`
- `tests/e2e/notifications-toast.spec.ts`

**Modified files:**
- `prisma/schema.prisma`
- `src/lib/notifications/dispatcher.ts`
- `src/components/primitives/site-header.tsx` (client bell mount)
- `src/components/nav/stylist-top-bar.tsx` (counterpartyLabel prop)
- `src/app/(stylist)/stylist/dashboard/dashboard-client.tsx` (counterpartyLabel prop)
- `src/app/(client-fullbleed)/sessions/[id]/chat/page.tsx` (remove PushPermission mount)
- `tests/payout-webhooks.test.ts` (assert Notification row in tip case)
- `package.json` (drop `web-push` dep)
- `.env.example` (add `TWILIO_SMS_FROM`, drop VAPID keys)
- `README.md`
- `CLAUDE.md`

**Deleted files:**
- `src/lib/web-push.ts`
- `src/app/api/push/subscribe/route.ts`
- `src/app/api/push/vapid-key/route.ts`
- `src/components/chat/push-permission.tsx`
- `src/components/stylist/NotificationsPopover.tsx` (moved to `src/components/notifications/`)
- `src/data/notifications.ts`
- `public/sw.js`

---

### Task 1: Prisma migration — add Notification, drop PushSubscription

**Files:**
- Modify: `prisma/schema.prisma`
- Create (auto): `prisma/migrations/<ts>_add_notifications_drop_push_subscriptions/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma` — add Notification model + 2 enums**

Append after the existing `NotificationPreference` model (~line 1257):

```prisma
model Notification {
  id        String               @id @default(cuid())
  userId    String               @map("user_id")
  user      User                 @relation(fields: [userId], references: [id], onDelete: Cascade)

  event     String
  category  NotificationCategory
  source    NotificationSource

  title     String
  body      String
  href      String?
  metadata  Json?

  readAt    DateTime?            @map("read_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, readAt])
  @@map("notifications")
}

enum NotificationCategory {
  TIP
  BOOKING
  MESSAGE
  SESSION
  REVIEW
  PAYOUT
  ORDER
  SUBSCRIPTION
  STYLIST_AVAILABILITY
  AFFILIATE
  PLATFORM
}

enum NotificationSource {
  CLIENT
  PLATFORM
}
```

- [ ] **Step 2: Add User back-relation, drop PushSubscription**

In the `User` model, add the back-relation (alphabetical with siblings):

```prisma
notifications     Notification[]
```

Remove this line from `User`:

```prisma
pushSubscriptions PushSubscription[]
```

Delete the entire `PushSubscription` model (around line 1340) and its `@@map("push_subscriptions")` block.

- [ ] **Step 3: Create migration**

```bash
npx prisma migrate dev --name add_notifications_drop_push_subscriptions
```

Expected: migration applied to local DB, `src/generated/prisma/` regenerates, no manual SQL edits required (Prisma handles enum + table creation + drop in one migration).

- [ ] **Step 4: Verify**

```bash
npx prisma generate && npm run typecheck 2>&1 | tail -20
```

Expected: typecheck passes (any TS errors flagging removed `pushSubscriptions` field will be fixed in Task 4 / Task 15 — note them but don't fix yet if they only appear in `web-push.ts` / `dispatcher.ts` / `push-permission.tsx`, which are getting deleted/rewritten anyway).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ src/generated/prisma/
git commit -m "$(cat <<'EOF'
feat(notifications): add Notification model, drop PushSubscription

Prisma migration adds the Notification table that backs the in-app bell
and removes PushSubscription as part of the Web Push removal. User gains
notifications back-relation; pushSubscriptions back-relation removed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Event metadata map

**Files:**
- Create: `src/lib/notifications/event-meta.ts`
- Create: `tests/notification-event-meta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/notification-event-meta.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { NOTIFICATION_EVENT_META } from "../src/lib/notifications/event-meta";
import type { NotificationEvent } from "../src/lib/notifications/dispatcher";

const ALL_EVENTS: NotificationEvent[] = [
  "affiliate.purchase_check",
  "moodboard.sent", "moodboard.feedback",
  "styleboard.sent", "styleboard.reviewed",
  "restyle.sent",
  "session.activated", "session.booked", "session.cancelled",
  "session.end_requested", "session.end_declined", "session.end_approved",
  "session.overdue", "session.auto_completed",
  "tip.received", "rating.posted",
  "payout.queued", "payout.completed", "payout.failed",
  "stylist.available", "stylist.waitlist_available",
  "order.shipped", "order.arrived", "order.return_initiated", "order.refunded",
  "subscription.retry_failed",
];

test("every NotificationEvent has metadata", () => {
  for (const ev of ALL_EVENTS) {
    const meta = NOTIFICATION_EVENT_META[ev];
    assert.ok(meta, `missing meta for ${ev}`);
    assert.ok(meta.category, `missing category for ${ev}`);
    assert.ok(meta.source, `missing source for ${ev}`);
    assert.equal(typeof meta.smsEnabled, "boolean", `bad smsEnabled for ${ev}`);
  }
});

test("exactly 8 events have SMS enabled", () => {
  const enabled = Object.entries(NOTIFICATION_EVENT_META)
    .filter(([, m]) => m.smsEnabled)
    .map(([k]) => k)
    .sort();
  assert.deepEqual(enabled, [
    "order.arrived",
    "order.shipped",
    "payout.completed",
    "session.activated",
    "session.booked",
    "session.overdue",
    "subscription.retry_failed",
    "tip.received",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --test-name-pattern="NotificationEvent has metadata"
```

Expected: FAIL with "Cannot find module '@/lib/notifications/event-meta'" or similar.

- [ ] **Step 3: Create `src/lib/notifications/event-meta.ts`**

```typescript
import type { NotificationEvent } from "./dispatcher";
import type { NotificationCategory, NotificationSource } from "@/generated/prisma/client";

export const NOTIFICATION_EVENT_META: Record<NotificationEvent, {
  category: NotificationCategory;
  source: NotificationSource;
  smsEnabled: boolean;
}> = {
  // CLIENT-source — actions taken by clients
  "tip.received":              { category: "TIP",      source: "CLIENT",   smsEnabled: true  },
  "session.booked":            { category: "BOOKING",  source: "CLIENT",   smsEnabled: true  },
  "session.activated":         { category: "SESSION",  source: "CLIENT",   smsEnabled: true  },
  "session.cancelled":         { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "session.end_requested":     { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "session.end_declined":      { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "session.end_approved":      { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "moodboard.sent":            { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "moodboard.feedback":        { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "styleboard.sent":           { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "styleboard.reviewed":       { category: "REVIEW",   source: "CLIENT",   smsEnabled: false },
  "restyle.sent":              { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "rating.posted":             { category: "REVIEW",   source: "CLIENT",   smsEnabled: false },

  // PLATFORM-source — system / billing / ops
  "session.overdue":           { category: "SESSION",  source: "PLATFORM", smsEnabled: true  },
  "session.auto_completed":    { category: "SESSION",  source: "PLATFORM", smsEnabled: false },
  "payout.queued":             { category: "PAYOUT",   source: "PLATFORM", smsEnabled: false },
  "payout.completed":          { category: "PAYOUT",   source: "PLATFORM", smsEnabled: true  },
  "payout.failed":             { category: "PAYOUT",   source: "PLATFORM", smsEnabled: false },
  "stylist.available":         { category: "STYLIST_AVAILABILITY", source: "PLATFORM", smsEnabled: false },
  "stylist.waitlist_available":{ category: "STYLIST_AVAILABILITY", source: "PLATFORM", smsEnabled: false },
  "order.shipped":             { category: "ORDER",    source: "PLATFORM", smsEnabled: true  },
  "order.arrived":             { category: "ORDER",    source: "PLATFORM", smsEnabled: true  },
  "order.return_initiated":    { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "order.refunded":            { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "subscription.retry_failed": { category: "SUBSCRIPTION", source: "PLATFORM", smsEnabled: true  },
  "affiliate.purchase_check":  { category: "AFFILIATE", source: "PLATFORM", smsEnabled: false },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --test-name-pattern="NotificationEvent|SMS enabled"
```

Expected: 2/2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/event-meta.ts tests/notification-event-meta.test.ts
git commit -m "$(cat <<'EOF'
feat(notifications): add event metadata map for category, source, sms

Single source of truth mapping each NotificationEvent to display
category, popover-tab source, and whether the event triggers SMS.
TS-exhaustive Record so the map can't drift from the dispatcher's
event union.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: SMS sender + templates

**Files:**
- Create: `src/lib/notifications/sms-templates.ts`
- Create: `src/lib/notifications/sms.ts`
- Create: `tests/notifications-sms.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/notifications-sms.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { renderSmsBody } from "../src/lib/notifications/sms-templates";

test("tip.received template renders with dollars + first name + url", () => {
  const body = renderSmsBody(
    {
      event: "tip.received",
      userId: "u1",
      title: "ignored",
      body: "ignored",
      url: "https://wishi.me/stylist/dashboard?session=s1",
      emailProperties: { tipInCents: 2500, firstName: "Olivia" },
    },
    { firstName: "Stylist" },
  );
  assert.ok(body);
  assert.match(body!, /Olivia tipped you \$25/);
  assert.match(body!, /https:\/\/wishi\.me\/stylist\/dashboard/);
  assert.ok(body!.length <= 160, `body too long: ${body!.length}`);
});

test("non-sms-enabled events return null", () => {
  const body = renderSmsBody(
    {
      event: "moodboard.sent",
      userId: "u1",
      title: "x",
      body: "x",
    },
    { firstName: "Client" },
  );
  assert.equal(body, null);
});

test("missing required emailProperties returns null gracefully", () => {
  const body = renderSmsBody(
    {
      event: "tip.received",
      userId: "u1",
      title: "x",
      body: "x",
      // no emailProperties
    },
    { firstName: "Stylist" },
  );
  assert.equal(body, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --test-name-pattern="tip.received template"
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create `src/lib/notifications/sms-templates.ts`**

```typescript
import type { DispatchInput, NotificationEvent } from "./dispatcher";
import { NOTIFICATION_EVENT_META } from "./event-meta";

interface RecipientCtx {
  firstName: string | null;
}

type TemplateFn = (input: DispatchInput, recipient: RecipientCtx) => string | null;

const dollars = (cents: unknown): string | null => {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const TEMPLATES: Partial<Record<NotificationEvent, TemplateFn>> = {
  "tip.received": (input) => {
    const amount = dollars(input.emailProperties?.tipInCents);
    const from = str(input.emailProperties?.firstName);
    if (!amount || !from || !input.url) return null;
    return `Wishi: ${from} tipped you $${amount} 🎉 ${input.url}`;
  },

  "session.booked": (input) => {
    const planName = str(input.emailProperties?.planName) ?? "new";
    const from = str(input.emailProperties?.firstName) ?? "a client";
    if (!input.url) return null;
    return `Wishi: New ${planName} booking from ${from}. ${input.url}`;
  },

  "session.activated": (input) => {
    const from = str(input.emailProperties?.firstName) ?? "Your client";
    if (!input.url) return null;
    return `Wishi: ${from} just messaged you. Start styling: ${input.url}`;
  },

  "session.overdue": (input) => {
    const from = str(input.emailProperties?.firstName) ?? "Your client";
    if (!input.url) return null;
    return `Wishi: Reminder — ${from} is waiting on you. ${input.url}`;
  },

  "payout.completed": (input) => {
    const amount = dollars(input.emailProperties?.amountInCents);
    if (!amount) return null;
    return `Wishi: Payout of $${amount} sent to your bank ✓`;
  },

  "order.shipped": (input) => {
    if (!input.url) return null;
    return `Wishi: Your order has shipped 📦 Track it: ${input.url}`;
  },

  "order.arrived": (input) => {
    if (!input.url) return null;
    return `Wishi: Your order arrived. 14 days to return anything: ${input.url}`;
  },

  "subscription.retry_failed": (input) => {
    if (!input.url) return null;
    return `Wishi: We couldn't bill your subscription. Update payment: ${input.url}`;
  },
};

export function renderSmsBody(
  input: DispatchInput,
  recipient: RecipientCtx,
): string | null {
  if (!NOTIFICATION_EVENT_META[input.event]?.smsEnabled) return null;
  const fn = TEMPLATES[input.event];
  if (!fn) return null;
  return fn(input, recipient);
}
```

- [ ] **Step 4: Create `src/lib/notifications/sms.ts`**

```typescript
import { getTwilioClient, getTwilioConfig } from "@/lib/twilio";
import { prisma } from "@/lib/prisma";
import { renderSmsBody } from "./sms-templates";
import type { DispatchInput } from "./dispatcher";

export async function sendSmsForEvent(input: DispatchInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { phone: true, firstName: true },
  });
  if (!user?.phone) return;

  const body = renderSmsBody(input, { firstName: user.firstName });
  if (!body) return;

  const from = process.env.TWILIO_SMS_FROM;
  if (!from) {
    console.warn(`[sms] TWILIO_SMS_FROM not set — skipping ${input.event}`);
    return;
  }

  const twilio = getTwilioClient();
  await twilio.messages.create({ to: user.phone, from, body });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --test-name-pattern="tip.received template|non-sms-enabled|missing required"
```

Expected: 3/3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/notifications/sms-templates.ts src/lib/notifications/sms.ts tests/notifications-sms.test.ts
git commit -m "$(cat <<'EOF'
feat(notifications): SMS sender + templates for 8 high-value events

Twilio SMS wrapper that no-ops on missing phone or missing
TWILIO_SMS_FROM env. Templates cover tip, session.booked,
session.activated, session.overdue, payout.completed,
order.shipped, order.arrived, subscription.retry_failed.
All bodies <= 160 chars. Missing template variables → null
(skip silently, never crash dispatcher).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Dispatcher rewrite — write Notification row, add SMS, drop Web Push

**Files:**
- Modify: `src/lib/notifications/dispatcher.ts`
- Create: `tests/notifications-dispatcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/notifications-dispatcher.test.ts`:

```typescript
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "dotenv/config";
import { dispatchNotification } from "../src/lib/notifications/dispatcher";
import { prisma } from "../src/lib/prisma";
import { ensureClientUser, cleanupE2EUserByEmail } from "./e2e/db";

let user: { id: string; email: string };

afterEach(async () => {
  if (user?.email) await cleanupE2EUserByEmail(user.email);
});

test("dispatchNotification persists Notification row with TIP/CLIENT", async () => {
  const email = `disp-${Date.now()}@e2e.wishi.test`;
  user = await ensureClientUser({ email });

  await dispatchNotification({
    event: "tip.received",
    userId: user.id,
    title: "You got a $25 tip",
    body: "Olivia left you a tip.",
    url: "/stylist/dashboard?session=abc",
    emailProperties: { tipInCents: 2500, firstName: "Olivia" },
  });

  const rows = await prisma.notification.findMany({ where: { userId: user.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "tip.received");
  assert.equal(rows[0].category, "TIP");
  assert.equal(rows[0].source, "CLIENT");
  assert.equal(rows[0].title, "You got a $25 tip");
  assert.equal(rows[0].href, "/stylist/dashboard?session=abc");
  assert.equal(rows[0].readAt, null);
});

test("dispatchNotification handles non-sms event without crashing", async () => {
  const email = `disp2-${Date.now()}@e2e.wishi.test`;
  user = await ensureClientUser({ email });

  await dispatchNotification({
    event: "moodboard.sent",
    userId: user.id,
    title: "New moodboard",
    body: "Your stylist sent you a moodboard.",
    url: "/sessions/abc/chat",
  });

  const rows = await prisma.notification.findMany({ where: { userId: user.id } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "MESSAGE");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --test-name-pattern="dispatchNotification persists"
```

Expected: FAIL — `notification` table empty (dispatcher not writing yet).

- [ ] **Step 3: Rewrite `src/lib/notifications/dispatcher.ts`**

Replace the file with:

```typescript
import { prisma } from "@/lib/prisma";
import { getKlaviyoClient } from "@/lib/integrations/klaviyo";
import { sendSmsForEvent } from "./sms";
import { NOTIFICATION_EVENT_META } from "./event-meta";
import type { Prisma } from "@/generated/prisma/client";

export type NotificationEvent =
  | "affiliate.purchase_check"
  | "moodboard.sent"
  | "moodboard.feedback"
  | "styleboard.sent"
  | "styleboard.reviewed"
  | "restyle.sent"
  | "session.activated"
  | "session.booked"
  | "session.cancelled"
  | "session.end_requested"
  | "session.end_declined"
  | "session.end_approved"
  | "session.overdue"
  | "session.auto_completed"
  | "tip.received"
  | "rating.posted"
  | "payout.queued"
  | "payout.completed"
  | "payout.failed"
  | "stylist.available"
  | "stylist.waitlist_available"
  | "order.shipped"
  | "order.arrived"
  | "order.return_initiated"
  | "order.refunded"
  | "subscription.retry_failed";

export interface DispatchInput {
  event: NotificationEvent;
  userId: string;
  title: string;
  body: string;
  url?: string;
  emailProperties?: Record<string, unknown>;
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  const meta = NOTIFICATION_EVENT_META[input.event];

  // 1. Persist in-app notification first — fail loud if this can't land.
  await prisma.notification.create({
    data: {
      userId: input.userId,
      event: input.event,
      category: meta.category,
      source: meta.source,
      title: input.title,
      body: input.body,
      href: input.url ?? null,
      metadata: (input.emailProperties ?? {}) as Prisma.InputJsonValue,
    },
  });

  // 2. Channel preferences for email + SMS.
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: input.userId, category: input.event },
    select: { channel: true, isEnabled: true },
  });
  const enabled = new Set(prefs.filter((p) => p.isEnabled).map((p) => p.channel));
  const explicitlyDisabled = new Set(prefs.filter((p) => !p.isEnabled).map((p) => p.channel));
  const shouldSend = (channel: "EMAIL" | "SMS") =>
    enabled.has(channel) || !explicitlyDisabled.has(channel);

  const tasks: Promise<unknown>[] = [];

  if (shouldSend("EMAIL")) {
    tasks.push(sendEmailViaKlaviyo(input).catch((err) => {
      console.warn(`[notifications] email failed for ${input.event}:`, err);
    }));
  }

  if (meta.smsEnabled && shouldSend("SMS")) {
    tasks.push(sendSmsForEvent(input).catch((err) => {
      console.warn(`[notifications] sms failed for ${input.event}:`, err);
    }));
  }

  await Promise.all(tasks);
}

async function sendEmailViaKlaviyo(input: DispatchInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user?.email) return;

  const result = await getKlaviyoClient()
    .trackEvent({
      event: input.event,
      profile: {
        email: user.email,
        externalId: user.id,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
      },
      properties: {
        title: input.title,
        body: input.body,
        ...(input.url ? { url: input.url } : {}),
        ...(input.emailProperties ?? {}),
      },
    })
    .catch((err) => {
      console.warn(`[notifications] klaviyo failed for ${input.event}:`, err);
      return { delivered: false, reason: "threw" as const };
    });

  if (!result.delivered && result.reason && result.reason !== "no_api_key") {
    console.warn(
      `[notifications] klaviyo ${input.event} not delivered:`,
      result.reason,
    );
  }
}

export async function notifyStylist(
  sessionId: string,
  input: Omit<DispatchInput, "userId">,
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { stylistId: true },
  });
  if (!session?.stylistId) return;
  await dispatchNotification({ ...input, userId: session.stylistId });
}

export async function notifyClient(
  sessionId: string,
  input: Omit<DispatchInput, "userId">,
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true },
  });
  if (!session?.clientId) return;
  await dispatchNotification({ ...input, userId: session.clientId });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --test-name-pattern="dispatchNotification"
```

Expected: 2/2 passing. Run full suite to ensure no regressions:

```bash
npm test 2>&1 | tail -20
```

Expected: no new failures (existing skipped tests stay skipped).

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/dispatcher.ts tests/notifications-dispatcher.test.ts
git commit -m "$(cat <<'EOF'
feat(notifications): dispatcher writes Notification row + adds SMS, drops Web Push

dispatchNotification persists a Notification row first (fail-fast) so
the in-app bell + toast surfaces have durable data, then fans out to
Klaviyo email and Twilio SMS as best-effort siblings. Web Push branch
removed; sendPushNotification import gone. notifyStylist/notifyClient
helpers preserved with identical signatures so all 28 existing dispatch
sites are untouched.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: format helper extraction

**Files:**
- Create: `src/lib/notifications/format.ts`
- Create: `tests/notifications-format.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/notifications-format.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { formatRelative } from "../src/lib/notifications/format";

test("formatRelative bucket boundaries", () => {
  const now = new Date("2026-05-13T12:00:00Z");
  assert.equal(formatRelative(new Date("2026-05-13T11:59:30Z"), now), "just now");
  assert.equal(formatRelative(new Date("2026-05-13T11:48:00Z"), now), "12m ago");
  assert.equal(formatRelative(new Date("2026-05-13T11:00:00Z"), now), "1h ago");
  assert.equal(formatRelative(new Date("2026-05-12T12:00:00Z"), now), "1d ago");
  assert.equal(formatRelative(new Date("2026-05-06T12:00:00Z"), now), "May 6");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --test-name-pattern="formatRelative bucket"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/notifications/format.ts`**

```typescript
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --test-name-pattern="formatRelative bucket"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/notifications/format.ts tests/notifications-format.test.ts
git commit -m "$(cat <<'EOF'
feat(notifications): extract formatRelative helper

Pure relative-time formatter consumed by the bell popover. Extracted
ahead of the popover rewrite so it has a unit-test home and isn't
buried in component code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: GET /api/notifications

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `tests/notifications-api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/notifications-api.test.ts`:

```typescript
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { dispatchNotification } from "../src/lib/notifications/dispatcher";
import { ensureClientUser, cleanupE2EUserByEmail } from "./e2e/db";
import { GET } from "../src/app/api/notifications/route";

let user: { id: string; clerkId: string; email: string };

afterEach(async () => {
  if (user?.email) await cleanupE2EUserByEmail(user.email);
});

function reqWithCookie(clerkId: string): Request {
  return new Request("http://localhost/api/notifications", {
    headers: { cookie: `__e2e_clerk_id=${clerkId}` },
  });
}

test("GET /api/notifications returns user's notifications, newest first", async () => {
  const email = `api-${Date.now()}@e2e.wishi.test`;
  user = await ensureClientUser({ email });

  await dispatchNotification({
    event: "session.booked",
    userId: user.id,
    title: "First",
    body: "First booking",
    url: "/x",
  });
  await new Promise((r) => setTimeout(r, 5));
  await dispatchNotification({
    event: "tip.received",
    userId: user.id,
    title: "Second",
    body: "Tip",
    url: "/y",
    emailProperties: { tipInCents: 1000, firstName: "Z" },
  });

  process.env.E2E_AUTH_MODE = "true";
  const res = await GET(reqWithCookie(user.clerkId));
  const json = await res.json();

  assert.equal(res.status, 200);
  assert.equal(json.items.length, 2);
  assert.equal(json.items[0].title, "Second");
  assert.equal(json.items[1].title, "First");
  assert.equal(json.unreadCount, 2);
  assert.ok(json.latestId);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --test-name-pattern="GET /api/notifications returns"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/api/notifications/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findFirst({
    where: { clerkId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: { userId: user.id, readAt: null },
    }),
  ]);

  return NextResponse.json({
    items,
    unreadCount,
    latestId: items[0]?.id ?? null,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --test-name-pattern="GET /api/notifications returns"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/route.ts tests/notifications-api.test.ts
git commit -m "$(cat <<'EOF'
feat(notifications): GET /api/notifications endpoint

Returns the current user's 50 newest notifications + unread count
+ latestId baseline anchor used by the client hook to suppress
toasts on first poll. force-dynamic + getServerAuth.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: POST /api/notifications/[id]/read

**Files:**
- Create: `src/app/api/notifications/[id]/read/route.ts`
- Modify: `tests/notifications-api.test.ts`

- [ ] **Step 1: Append failing test to `tests/notifications-api.test.ts`**

```typescript
import { POST as readOne } from "../src/app/api/notifications/[id]/read/route";

test("POST /api/notifications/:id/read marks read, ownership-checked", async () => {
  const email = `read-${Date.now()}@e2e.wishi.test`;
  user = await ensureClientUser({ email });
  await dispatchNotification({
    event: "session.booked",
    userId: user.id,
    title: "x",
    body: "x",
  });
  const n = await prisma.notification.findFirst({ where: { userId: user.id } });
  assert.ok(n);

  const req = new Request(`http://localhost/api/notifications/${n.id}/read`, {
    method: "POST",
    headers: { cookie: `__e2e_clerk_id=${user.clerkId}` },
  });
  process.env.E2E_AUTH_MODE = "true";
  const res = await readOne(req, { params: Promise.resolve({ id: n.id }) });
  assert.equal(res.status, 200);

  const after = await prisma.notification.findUnique({ where: { id: n.id } });
  assert.ok(after?.readAt);
});

test("POST /api/notifications/:id/read 404s when not owner", async () => {
  const email = `read2-${Date.now()}@e2e.wishi.test`;
  user = await ensureClientUser({ email });
  // Create a notification owned by a *different* user
  const otherEmail = `read2-other-${Date.now()}@e2e.wishi.test`;
  const other = await ensureClientUser({ email: otherEmail });
  try {
    await dispatchNotification({
      event: "session.booked",
      userId: other.id,
      title: "x",
      body: "x",
    });
    const n = await prisma.notification.findFirst({ where: { userId: other.id } });
    const req = new Request(`http://localhost/api/notifications/${n!.id}/read`, {
      method: "POST",
      headers: { cookie: `__e2e_clerk_id=${user.clerkId}` },
    });
    const res = await readOne(req, { params: Promise.resolve({ id: n!.id }) });
    assert.equal(res.status, 404);
  } finally {
    await cleanupE2EUserByEmail(otherEmail);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --test-name-pattern="marks read|not owner"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/api/notifications/[id]/read/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findFirst({
    where: { clerkId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const after = await prisma.notification.findUnique({ where: { id } });
  return NextResponse.json({ readAt: after!.readAt });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --test-name-pattern="marks read|not owner"
```

Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/[id]/read/route.ts tests/notifications-api.test.ts
git commit -m "$(cat <<'EOF'
feat(notifications): POST /:id/read endpoint

Marks a single notification read with ownership check via
updateMany guard. Returns 404 when the row exists but isn't
the current user's. Idempotent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: POST /api/notifications/read-all

**Files:**
- Create: `src/app/api/notifications/read-all/route.ts`
- Modify: `tests/notifications-api.test.ts`

- [ ] **Step 1: Append failing test**

```typescript
import { POST as readAll } from "../src/app/api/notifications/read-all/route";

test("POST /api/notifications/read-all marks all unread", async () => {
  const email = `readall-${Date.now()}@e2e.wishi.test`;
  user = await ensureClientUser({ email });
  for (const t of ["a", "b", "c"]) {
    await dispatchNotification({
      event: "session.booked",
      userId: user.id,
      title: t,
      body: t,
    });
  }

  const req = new Request("http://localhost/api/notifications/read-all", {
    method: "POST",
    headers: { cookie: `__e2e_clerk_id=${user.clerkId}` },
  });
  process.env.E2E_AUTH_MODE = "true";
  const res = await readAll(req);
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.count, 3);

  const remainingUnread = await prisma.notification.count({
    where: { userId: user.id, readAt: null },
  });
  assert.equal(remainingUnread, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --test-name-pattern="read-all marks all unread"
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/api/notifications/read-all/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_req: Request) {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findFirst({
    where: { clerkId, deletedAt: null },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ count: result.count });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --test-name-pattern="read-all marks all unread"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notifications/read-all/route.ts tests/notifications-api.test.ts
git commit -m "$(cat <<'EOF'
feat(notifications): POST /read-all endpoint

Marks all unread notifications for the current user as read in
a single updateMany. Returns count flipped.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: useNotifications hook

**Files:**
- Create: `src/lib/notifications/use-notifications.ts`

(No standalone unit test — the hook's behaviour is covered by the e2e specs in Task 14, since polling + sonner integration is a DOM concern.)

- [ ] **Step 1: Create `src/lib/notifications/use-notifications.ts`**

```typescript
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Notification } from "@/generated/prisma/client";

const POLL_INTERVAL_MS = 10_000;

interface FetchResponse {
  items: Notification[];
  unreadCount: number;
  latestId: string | null;
}

export function useNotifications() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const baselineEstablishedRef = useRef(false);
  const lastSeenIdRef = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data: FetchResponse = await res.json();
      setItems(data.items);
      setUnreadCount(data.unreadCount);

      if (!baselineEstablishedRef.current) {
        lastSeenIdRef.current = data.latestId;
        baselineEstablishedRef.current = true;
        return;
      }

      // Toast for items newer than lastSeen.
      const newOnes = data.items.filter((n) =>
        lastSeenIdRef.current === null
          ? true
          : n.id > lastSeenIdRef.current,
      );
      for (const n of newOnes) {
        toast(n.title, {
          description: n.body,
          action: n.href
            ? {
                label: "View",
                onClick: () => {
                  void markRead(n.id);
                  router.push(n.href!);
                },
              }
            : undefined,
        });
      }
      if (data.latestId) lastSeenIdRef.current = data.latestId;
    } catch (err) {
      console.warn("[notifications] poll failed:", err);
    }
  }, [router]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    } catch (err) {
      console.warn("[notifications] markRead failed:", err);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date() })));
    setUnreadCount(0);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
    } catch (err) {
      console.warn("[notifications] markAllRead failed:", err);
    }
  }, []);

  useEffect(() => {
    void refetch();
    const id = setInterval(() => void refetch(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  return { items, unreadCount, markRead, markAllRead, refetch };
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/notifications/use-notifications.ts
git commit -m "$(cat <<'EOF'
feat(notifications): useNotifications hook with 10s polling + toast

Client hook that fetches /api/notifications on mount, polls every 10s,
and fires a sonner toast for any notification with id > the baseline
established on first poll (so backlog never blasts users). Exposes
optimistic markRead and markAllRead. Click on toast action navigates
+ marks read.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: NotificationsPopover rewrite + relocation

**Files:**
- Create: `src/components/notifications/notifications-popover.tsx`
- Delete: `src/components/stylist/NotificationsPopover.tsx` (deferred to Task 11 with mount updates so we don't break the build)

- [ ] **Step 1: Create the new component**

Create `src/components/notifications/notifications-popover.tsx`:

```typescript
"use client";

import { useMemo, useState } from "react";
import {
  BellIcon,
  CalendarIcon,
  MessageCircleIcon,
  CheckCircle2Icon,
  StarIcon,
  DollarSignIcon,
  CrownIcon,
  ShoppingBagIcon,
  BanknoteIcon,
  HeartIcon,
  SparklesIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { formatRelative } from "@/lib/notifications/format";
import { useRouter } from "next/navigation";
import type { NotificationCategory } from "@/generated/prisma/client";

const CATEGORY_ICON: Record<NotificationCategory, React.ComponentType<{ className?: string }>> = {
  TIP: DollarSignIcon,
  BOOKING: CalendarIcon,
  MESSAGE: MessageCircleIcon,
  SESSION: CheckCircle2Icon,
  REVIEW: StarIcon,
  PAYOUT: BanknoteIcon,
  ORDER: ShoppingBagIcon,
  SUBSCRIPTION: CrownIcon,
  STYLIST_AVAILABILITY: HeartIcon,
  AFFILIATE: SparklesIcon,
  PLATFORM: RefreshCwIcon,
};

interface Props {
  /** Label for the "counterparty" tab. "Clients" for stylist surface, "Stylists" for client surface. */
  counterpartyLabel: "Clients" | "Stylists";
}

export function NotificationsPopover({ counterpartyLabel }: Props) {
  const router = useRouter();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "counterparty" | "platform">("all");

  const filtered = useMemo(() => {
    if (tab === "counterparty") return items.filter((n) => n.source === "CLIENT");
    if (tab === "platform") return items.filter((n) => n.source === "PLATFORM");
    return items;
  }, [items, tab]);

  const handleClick = (id: string, href: string | null) => {
    void markRead(id);
    setOpen(false);
    if (href) router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-full p-2 hover:bg-muted transition-colors"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        >
          <BellIcon className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-medium text-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-medium">Notifications</div>
            <div className="text-xs text-muted-foreground">
              {unreadCount} unread
            </div>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Mark all read
          </button>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="counterparty">{counterpartyLabel}</TabsTrigger>
            <TabsTrigger value="platform">Platform</TabsTrigger>
          </TabsList>
          <ScrollArea className="h-[420px]">
            <ul>
              {filtered.length === 0 && (
                <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nothing here yet
                </li>
              )}
              {filtered.map((n) => {
                const Icon = CATEGORY_ICON[n.category] ?? RefreshCwIcon;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      !n.readAt && "bg-warm-beige/30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleClick(n.id, n.href)}
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{n.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {formatRelative(new Date(n.createdAt))}
                        </div>
                      </div>
                      {!n.readAt && (
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-burgundy" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck 2>&1 | tail -10
```

Expected: clean (the OLD `src/components/stylist/NotificationsPopover.tsx` still exists and still imports from `src/data/notifications.ts` — both go away in Task 11).

- [ ] **Step 3: Commit**

```bash
git add src/components/notifications/notifications-popover.tsx
git commit -m "$(cat <<'EOF'
feat(notifications): rewrite popover to use real data + toast hook

New role-agnostic popover at src/components/notifications/. Drives bell
badge, list, and Mark all read off useNotifications(). Icon map keyed
by NotificationCategory enum; old NotificationType union retired with
the mock data file in the next commit. counterpartyLabel prop renames
the middle tab between "Clients" (stylist surface) and "Stylists"
(client surface).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Wire mounts (stylist + client) and delete old popover + mock data

**Files:**
- Modify: `src/app/(stylist)/stylist/dashboard/dashboard-client.tsx` (lines 74, 936)
- Modify: `src/components/nav/stylist-top-bar.tsx` (lines 16, 51)
- Modify: `src/components/primitives/site-header.tsx` (insert mount between My Style Sessions and cart)
- Delete: `src/components/stylist/NotificationsPopover.tsx`
- Delete: `src/data/notifications.ts`

- [ ] **Step 1: Update stylist dashboard import + usage**

In `src/app/(stylist)/stylist/dashboard/dashboard-client.tsx`:
- Change line ~74:
  ```typescript
  import { NotificationsPopover } from "@/components/stylist/NotificationsPopover";
  ```
  to:
  ```typescript
  import { NotificationsPopover } from "@/components/notifications/notifications-popover";
  ```
- Change line ~936 from `<NotificationsPopover />` to `<NotificationsPopover counterpartyLabel="Clients" />`.

- [ ] **Step 2: Update stylist top bar import + usage**

In `src/components/nav/stylist-top-bar.tsx`:
- Change line ~16 import path the same way.
- Change line ~51 from `<NotificationsPopover />` to `<NotificationsPopover counterpartyLabel="Clients" />`.

- [ ] **Step 3: Mount on client `SiteHeader`**

In `src/components/primitives/site-header.tsx`, add the import:

```typescript
import { NotificationsPopover } from "@/components/notifications/notifications-popover";
```

In the signed-in branch (~line 51-66), insert the bell between `<MyStyleSessionsLink />` and the cart `<Link href="/cart">`:

```tsx
{signedIn ? (
  <>
    <MyStyleSessionsLink />
    <NotificationsPopover counterpartyLabel="Stylists" />
    <Link href="/cart" /* ... */ >
      ...
    </Link>
    <SiteHeaderUserMenu />
  </>
) : ...}
```

- [ ] **Step 4: Delete old popover and mock data**

```bash
rm src/components/stylist/NotificationsPopover.tsx src/data/notifications.ts
```

- [ ] **Step 5: Grep for stragglers**

```bash
grep -rn "from \"@/data/notifications\"\|from \"@/components/stylist/NotificationsPopover\"\|mockNotifications\|AppNotification" src/ --include="*.ts" --include="*.tsx" 2>&1 | grep -v generated || echo "clean"
```

Expected: `clean`. If any imports remain, fix them.

- [ ] **Step 6: Verify build**

```bash
npm run typecheck 2>&1 | tail -10 && npm run lint 2>&1 | tail -10
```

Expected: both clean.

- [ ] **Step 7: Smoke-check the routes via dev server**

```bash
pkill -f "next dev" 2>/dev/null; npm run dev &  # background
sleep 8
curl -sI http://localhost:3000/sessions 2>&1 | head -1
curl -sI http://localhost:3000/stylist/dashboard 2>&1 | head -1
pkill -f "next dev"
```

Expected: both return `HTTP/1.1 200` (or 307 to sign-in if no auth — that's fine, we're confirming the build doesn't crash).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(notifications): wire bell on client + stylist surfaces, delete mocks

Client SiteHeader gets the bell between My Style Sessions and the cart
icon (stylist sees "Clients" tab; client sees "Stylists"). Old
src/components/stylist/NotificationsPopover.tsx and the
src/data/notifications.ts mock fixtures deleted. counterpartyLabel
prop drives the middle-tab text per surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Extend tip-webhook integration test

**Files:**
- Modify: `tests/payout-webhooks.test.ts` (the test labelled `tip payment_intent.succeeded …` around line 152)

- [ ] **Step 1: Read the existing tip test**

```bash
sed -n '152,200p' tests/payout-webhooks.test.ts
```

- [ ] **Step 2: Append Notification assertion**

After the existing assertions on `Payment.type === "TIP"` etc., add:

```typescript
const notif = await prisma.notification.findFirst({
  where: { userId: stylist.id, event: "tip.received" },
  orderBy: { createdAt: "desc" },
});
assert.ok(notif, "expected Notification row for tip.received");
assert.equal(notif!.category, "TIP");
assert.equal(notif!.source, "CLIENT");
assert.match(notif!.title, /tip/i);
```

(If the test does not already import `prisma`, add `import { prisma } from "../src/lib/prisma";` at the top.)

Also extend the `afterEach` cleanup to remove notifications:

```typescript
await getPool().query(
  "DELETE FROM notifications WHERE user_id = $1",
  [stylist.id],
);
```

- [ ] **Step 3: Run test to verify it passes**

```bash
npm test -- --test-name-pattern="tip payment_intent.succeeded"
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/payout-webhooks.test.ts
git commit -m "$(cat <<'EOF'
test(notifications): tip webhook also writes Notification row

Extends the integration test to assert that handleTipPaymentSucceeded
fires dispatchNotification which lands a Notification(category=TIP,
source=CLIENT) for the stylist alongside the Payment + Session writes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: E2E specs

**Files:**
- Create: `tests/e2e/stylist-notifications.spec.ts`
- Create: `tests/e2e/client-notifications.spec.ts`
- Create: `tests/e2e/notifications-toast.spec.ts`

- [ ] **Step 1: Create `tests/e2e/stylist-notifications.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

test("stylist bell shows real notifications, click marks read + navigates", async ({ page }) => {
  const email = `bell-stylist-${Date.now()}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({ email });
  await ensureStylistProfile({ userId: stylist.id });

  // Seed a Notification directly so we don't depend on a webhook.
  const { rows } = await getPool().query(
    `INSERT INTO notifications (id, user_id, event, category, source, title, body, href, created_at)
     VALUES (gen_random_uuid()::text, $1, 'tip.received', 'TIP', 'CLIENT',
             'You got a $25 tip', 'Olivia left you a tip.', '/stylist/dashboard?session=abc', NOW())
     RETURNING id`,
    [stylist.id],
  );
  const notifId = rows[0].id;

  try {
    await page.goto(`/sign-in?e2e=1`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/stylist\/dashboard/, { timeout: 10_000 });

    await page.locator('button[aria-label*="Notifications"]').click();
    await expect(page.getByText("You got a $25 tip")).toBeVisible();
    await expect(page.getByText("Olivia left you a tip.")).toBeVisible();
    await expect(page.locator('button[aria-label*="1 unread"]')).toBeVisible();

    await page.getByText("You got a $25 tip").click();
    await page.waitForURL(/session=abc/);

    const after = await getPool().query(
      "SELECT read_at FROM notifications WHERE id = $1",
      [notifId],
    );
    expect(after.rows[0].read_at).not.toBeNull();
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [stylist.id]);
    await cleanupE2EUserByEmail(email);
  }
});

test("Mark all read clears the badge", async ({ page }) => {
  const email = `bell-mark-all-${Date.now()}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({ email });
  await ensureStylistProfile({ userId: stylist.id });

  for (let i = 0; i < 3; i++) {
    await getPool().query(
      `INSERT INTO notifications (id, user_id, event, category, source, title, body, created_at)
       VALUES (gen_random_uuid()::text, $1, 'session.booked', 'BOOKING', 'CLIENT',
               $2, 'body', NOW())`,
      [stylist.id, `Booking ${i}`],
    );
  }

  try {
    await page.goto(`/sign-in?e2e=1`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/stylist\/dashboard/);

    await page.locator('button[aria-label*="Notifications"]').click();
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.locator('button[aria-label*="unread"]')).toHaveCount(0);
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [stylist.id]);
    await cleanupE2EUserByEmail(email);
  }
});
```

- [ ] **Step 2: Create `tests/e2e/client-notifications.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import { ensureClientUser, cleanupE2EUserByEmail, getPool } from "./db";

test("client bell shows real notifications between My Style Sessions and cart", async ({ page }) => {
  const email = `bell-client-${Date.now()}@e2e.wishi.test`;
  const client = await ensureClientUser({ email });

  await getPool().query(
    `INSERT INTO notifications (id, user_id, event, category, source, title, body, href, created_at)
     VALUES (gen_random_uuid()::text, $1, 'styleboard.sent', 'MESSAGE', 'CLIENT',
             'New look from your stylist', 'Open to view 12 pieces.', '/sessions/xyz/chat', NOW())`,
    [client.id],
  );

  try {
    await page.goto(`/sign-in?e2e=1`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 10_000 });

    await page.goto("/sessions");
    await expect(page.locator('button[aria-label*="Notifications"]')).toBeVisible();

    // Confirm DOM order: My Style Sessions → Notifications → cart.
    const labels = await page.locator("header a, header button").allTextContents();
    const my = labels.findIndex((l) => l.includes("My Style Sessions"));
    const cartIdx = labels.findIndex((l) => l.toLowerCase().includes("cart"));
    expect(my).toBeGreaterThan(-1);
    expect(cartIdx).toBeGreaterThan(my);

    await page.locator('button[aria-label*="Notifications"]').click();
    await expect(page.getByText("New look from your stylist")).toBeVisible();
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [client.id]);
    await cleanupE2EUserByEmail(email);
  }
});
```

- [ ] **Step 3: Create `tests/e2e/notifications-toast.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import {
  ensureStylistUser,
  ensureStylistProfile,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

test("toast fires for newly-arrived notification (mid-session insert)", async ({ page }) => {
  const email = `toast-${Date.now()}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({ email });
  await ensureStylistProfile({ userId: stylist.id });

  try {
    await page.goto(`/sign-in?e2e=1`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/stylist\/dashboard/);

    // Initial state: zero notifications. Hook establishes baseline (no toast).
    await page.waitForTimeout(1500);

    // Insert a notification mid-session.
    await getPool().query(
      `INSERT INTO notifications (id, user_id, event, category, source, title, body, href, created_at)
       VALUES (gen_random_uuid()::text, $1, 'tip.received', 'TIP', 'CLIENT',
               'Mid-session tip', 'Toast me!', '/stylist/dashboard', NOW())`,
      [stylist.id],
    );

    // Wait up to 12s for the next poll cycle.
    await expect(page.getByText("Mid-session tip")).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText("Toast me!")).toBeVisible();
  } finally {
    await getPool().query("DELETE FROM notifications WHERE user_id = $1", [stylist.id]);
    await cleanupE2EUserByEmail(email);
  }
});
```

- [ ] **Step 4: Run e2e specs (best-effort locally)**

```bash
npm run e2e -- tests/e2e/stylist-notifications.spec.ts tests/e2e/client-notifications.spec.ts tests/e2e/notifications-toast.spec.ts 2>&1 | tail -30
```

Expected: all three pass against `npm run start:e2e`. (If local environment lacks the seeded Plans/Quizzes via global-setup, this still runs because we use `ensureClientUser` / `ensureStylistUser` which set up everything they need.)

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/stylist-notifications.spec.ts tests/e2e/client-notifications.spec.ts tests/e2e/notifications-toast.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): bell + toast for stylist + client surfaces

Three Playwright specs covering: stylist bell click → mark read +
navigate, "Mark all read" clears badge, client bell rendered between
My Style Sessions and cart with correct content, and toast firing for
a notification inserted mid-session (verifies the 10s poll cycle).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Web Push purge

**Files (delete):**
- `src/lib/web-push.ts`
- `src/app/api/push/subscribe/route.ts`
- `src/app/api/push/vapid-key/route.ts`
- (Whole directory `src/app/api/push/`)
- `src/components/chat/push-permission.tsx`
- `public/sw.js`

**Files (modify):**
- `src/app/(client-fullbleed)/sessions/[id]/chat/page.tsx` (remove import line 6 + mount line 122)
- `package.json` (drop `web-push` dep)
- `.env.example` (drop VAPID keys)

- [ ] **Step 1: Remove the chat page mount**

In `src/app/(client-fullbleed)/sessions/[id]/chat/page.tsx`:
- Delete the import `import { PushPermission } from "@/components/chat/push-permission";` (line 6)
- Delete the `<PushPermission />` JSX (line 122)

- [ ] **Step 2: Delete files + directory**

```bash
rm src/lib/web-push.ts \
   src/components/chat/push-permission.tsx \
   public/sw.js
rm -rf src/app/api/push/
```

- [ ] **Step 3: Drop the `web-push` npm dep**

```bash
npm uninstall web-push @types/web-push 2>&1 | tail -3
```

(`@types/web-push` may not be installed — `npm uninstall` is a no-op for missing packages.)

- [ ] **Step 4: Strip VAPID env vars from `.env.example`**

Remove any `VAPID_PUBLIC_KEY=`, `VAPID_PRIVATE_KEY=`, `VAPID_SUBJECT=` lines.

- [ ] **Step 5: Verify build**

```bash
npm run typecheck 2>&1 | tail -10 && grep -rn "web-push\|sendPushNotification\|PushSubscription\|/api/push\|VAPID" src/ public/ .env.example package.json 2>/dev/null | grep -v generated | grep -v node_modules || echo "clean"
```

Expected: typecheck clean, grep returns `clean`. (Generated Prisma files won't reference `PushSubscription` because we dropped the model in Task 1.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(notifications): remove Web Push entirely

Deletes web-push lib, /api/push/{subscribe,vapid-key} routes,
PushPermission component + its mount in the client chat page,
public/sw.js service worker, web-push npm dep, and VAPID env vars.
PushSubscription Prisma model already dropped in the migration.
SMS + email + bell + toast carry the notification surface from here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Doc updates + Notion + branch prep

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `.env.example` (add `TWILIO_SMS_FROM=`)

- [ ] **Step 1: CLAUDE.md — add Notifications convention block**

In the "Key conventions" section (between "Stylist reviews" and the "Admin" entry), insert:

```markdown
- **Notifications:** `src/lib/notifications/dispatcher.ts::dispatchNotification` is the single fan-out point. Writes a `Notification` row first (fail-fast — the in-app surface is the catch-up channel and must never be silently lost), then fans out to email (Klaviyo, all events) and SMS (Twilio, 8 events listed in `event-meta.ts`: `tip.received`, `session.booked`, `session.activated`, `session.overdue`, `payout.completed`, `order.shipped`, `order.arrived`, `subscription.retry_failed`). The bell (`src/components/notifications/notifications-popover.tsx`) is mounted on both the stylist top bar / dashboard and the client `SiteHeader` between My Style Sessions and the cart. The popover drives off `useNotifications()` which polls `/api/notifications` every 10s, fires sonner toasts for any id newer than the first-fetch baseline, and exposes optimistic mark-read. No Web Push.
```

- [ ] **Step 2: CLAUDE.md — update the Tip flow line**

Find the existing **Tip flow** entry (line ~220) and append to the last sentence:

```
… The webhook also writes a Notification(category=TIP) row consumed by the stylist bell + toast.
```

- [ ] **Step 3: CLAUDE.md — strip Web Push references**

Search for any mention of "Web Push", "VAPID", "push permission", "PushSubscription" in CLAUDE.md and remove them (they may exist in the chat / notification preference / proxy sections).

```bash
grep -n -i "web push\|web-push\|vapid\|push.permission\|pushsubscription" CLAUDE.md
```

For each hit, edit out the reference (or replace with the new bell + toast wording where appropriate).

- [ ] **Step 4: README.md**

Add to the env-vars table (or wherever they live):
```
TWILIO_SMS_FROM=+1XXXXXXXXXX  # E.164 phone number used as From for transactional SMS
```

Remove any `VAPID_*` lines.

- [ ] **Step 5: `.env.example`**

Add `TWILIO_SMS_FROM=` to the Twilio section (no value).

- [ ] **Step 6: Notion roadmap flip**

Find the relevant roadmap row (search the database id stored in `reference_notion_roadmap.md` auto-memory). Run:

```bash
notion db query <db-id> --filter '<find the "Notifications" or "Bell rewire" row>'
notion page update <page-id> --property "Status=Done"
```

If no matching row exists, skip — the launch-prep doc is the canonical tracker.

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md .env.example
git commit -m "$(cat <<'EOF'
docs(notifications): convention block + tip-flow update + Web Push purge

CLAUDE.md gains a Notifications key-convention entry and the Tip flow
line mentions the Notification row write. Web Push references stripped.
README + .env.example carry TWILIO_SMS_FROM and lose VAPID keys.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Final whole-suite verification**

```bash
npm run typecheck 2>&1 | tail -5 && \
npm run lint 2>&1 | tail -5 && \
npm test 2>&1 | tail -10
```

Expected: typecheck clean, lint clean, unit/integration tests pass with no new failures.

Run the price-grep gate (per CLAUDE.md "Definition of done"):

```bash
rg -n '"\$60|"\$130|"\$550|"\$20|6000|13000|55000|2000' src/ \
  -g '!lib/plans.ts' -g '!lib/ui/plan-copy.ts' \
  -g '!**/*.test.*' -g '!**/*.md'
```

Expected: no hits (or only pre-existing ones unrelated to this branch).

- [ ] **Step 9: Push branch + open PR**

```bash
git push -u origin real-notifications
gh pr create --title "feat(notifications): real Notification model + bell rewire + Web Push removal" --body "$(cat <<'EOF'
## Summary
- Adds a real `Notification` Prisma model written by `dispatchNotification()` so the stylist + client bells can surface every event the dispatcher already fires (28 events).
- Replaces Loveable mock notifications. Bell + sonner toast both poll `/api/notifications` every 10s with first-fetch baseline so backlog doesn't spam users.
- Adds Twilio SMS for 8 high-value events: `tip.received`, `session.booked`, `session.activated`, `session.overdue`, `payout.completed`, `order.shipped`, `order.arrived`, `subscription.retry_failed`.
- Removes Web Push entirely (lib, routes, service worker, permission UI, npm dep, env vars, Prisma model).
- Mounts the bell on the client `SiteHeader` between My Style Sessions and the cart icon.

Spec: `docs/superpowers/specs/2026-05-13-real-notifications-design.md`

## Test plan
- [x] `npm run typecheck` clean
- [x] `npm run lint` clean
- [x] `npm test` — new + existing tests pass; tip webhook integration test asserts the Notification row
- [x] `tests/e2e/stylist-notifications.spec.ts` — bell click marks read + navigates, Mark all read clears badge
- [x] `tests/e2e/client-notifications.spec.ts` — bell rendered in correct DOM position
- [x] `tests/e2e/notifications-toast.spec.ts` — toast fires within 10s of mid-session insert

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (filled inline before handoff)

**Spec coverage:** every section of the spec has at least one task (schema → 1; event-meta → 2; SMS → 3; dispatcher → 4; format → 5; APIs → 6/7/8; hook → 9; popover → 10; mounts + mock purge → 11; tip-webhook test → 12; e2e → 13; Web Push purge → 14; docs → 15).

**Type consistency:** `NotificationCategory` and `NotificationSource` enums are referenced consistently across schema, event-meta, dispatcher, popover, and tests. `useNotifications()` returns the same shape consumed by the popover. API response shape (`{ items, unreadCount, latestId }`) used identically in the GET endpoint, the hook, and tests.

**Placeholders:** none — every step contains real code or real commands. The Notion roadmap step is conditional ("skip if no row exists") rather than a TBD.

**Risks:** the dispatcher rewrite (Task 4) deletes the Web Push code path — between Task 4 and Task 14 the `web-push.ts` file still exists on disk but no longer has any caller. That's a tolerable two-commit window because nothing else imports it.
