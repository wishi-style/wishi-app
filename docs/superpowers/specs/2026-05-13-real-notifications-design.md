# Real Notifications — Design Spec

**Date:** 2026-05-13
**Status:** Approved
**Owner:** Matt Cardozo

## Problem

The stylist notification bell (`NotificationsPopover`) renders a hardcoded array of mock notifications from `src/data/notifications.ts`. Real events that fan out via `dispatchNotification()` (28 events including `tip.received`, `session.booked`, `payout.completed`, `order.shipped`, etc.) reach users only through Klaviyo email and Web Push — they are never persisted for in-app display.

Concrete failure: a tip paid through `/sessions/[id]/end-session` charges the client's card, writes `Session.tipInCents` + `Payment(type=TIP)`, and dispatches `notifyStylist({ event: "tip.received", … })`. The stylist sees nothing in the bell — the panel still shows fixtures like "Olivia tipped you $25 🎉".

The client has no notification bell at all today.

## Goals

1. Every event currently dispatched via `dispatchNotification()` is persisted as a `Notification` row and rendered in an in-app bell for both the stylist and the client.
2. The bell stays close to live without adding realtime infrastructure: 10 s polling drives both the bell badge and a sonner toast for newly-arrived events.
3. Replace Web Push (browser permission prompts, OS-level notifications) with SMS for high-value events. Email remains the always-on fallback.
4. The stylist sees a notification within ~10 s of a tip charge succeeding.

## Non-goals

- Realtime WebSocket / Pusher / Ably / SSE delivery (10 s polling is the freshness contract)
- Per-event preference editor UI in user settings (the existing `NotificationPreference` table stays unwired to UI; opt-out is API-only for now)
- Backfill of historical events into the bell (start from migration time)
- iOS PWA push (gone with Web Push removal)
- Re-emitting chat messages through the new system (Twilio Conversations remains the chat transport; chat messages are not `Notification` rows)

## Channel matrix

|             | In-app bell | Toast (live, while app open) | Email          | SMS                      |
|-------------|-------------|------------------------------|----------------|--------------------------|
| **Stylist** | all events  | all events, 10 s poll        | all events (Klaviyo) | 5 events (Twilio)        |
| **Client**  | all events  | all events, 10 s poll        | all events (Klaviyo) | 3 events (Twilio)        |

Web Push is removed entirely (model, routes, lib, npm dep, permission UI, service worker registration).

## Data model

```prisma
model Notification {
  id        String                @id @default(cuid())
  userId    String                @map("user_id")
  user      User                  @relation(fields: [userId], references: [id], onDelete: Cascade)

  event     String                // mirrors NotificationEvent dispatcher key, e.g. "tip.received"
  category  NotificationCategory  // bucket for icon / grouping
  source    NotificationSource    // CLIENT | PLATFORM — drives the popover's tab filter

  title     String
  body      String
  href      String?               // navigate target on click
  metadata  Json?                 // free-form payload (sessionId, amountInCents, clientName, …)

  readAt    DateTime?             @map("read_at")
  createdAt DateTime  @default(now()) @map("created_at")

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

`User.notifications Notification[]` back-relation added. Cascade-delete matches existing User-owned model conventions.

## Event metadata map

`src/lib/notifications/event-meta.ts` is the single source of truth for how each `NotificationEvent` is categorised, where it lands in the popover tabs, and whether it triggers SMS. TS exhaustiveness check (`Record<NotificationEvent, …>`) enforces that every dispatcher event has a row.

```ts
export const NOTIFICATION_EVENT_META: Record<NotificationEvent, {
  category: NotificationCategory;
  source: NotificationSource;
  smsEnabled: boolean;
}> = {
  // CLIENT-source — actions taken by clients that the stylist needs to know about
  "tip.received":            { category: "TIP",      source: "CLIENT",   smsEnabled: true  },
  "session.booked":          { category: "BOOKING",  source: "CLIENT",   smsEnabled: true  },
  "session.activated":       { category: "SESSION",  source: "CLIENT",   smsEnabled: true  },
  "session.cancelled":       { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "session.end_requested":   { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "session.end_declined":    { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "session.end_approved":    { category: "SESSION",  source: "CLIENT",   smsEnabled: false },
  "moodboard.sent":          { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "moodboard.feedback":      { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "styleboard.sent":         { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "styleboard.reviewed":     { category: "REVIEW",   source: "CLIENT",   smsEnabled: false },
  "restyle.sent":            { category: "MESSAGE",  source: "CLIENT",   smsEnabled: false },
  "rating.posted":           { category: "REVIEW",   source: "CLIENT",   smsEnabled: false },

  // PLATFORM-source — system / billing / ops events
  "session.overdue":         { category: "SESSION",  source: "PLATFORM", smsEnabled: true  },
  "session.auto_completed":  { category: "SESSION",  source: "PLATFORM", smsEnabled: false },
  "payout.queued":           { category: "PAYOUT",   source: "PLATFORM", smsEnabled: false },
  "payout.completed":        { category: "PAYOUT",   source: "PLATFORM", smsEnabled: true  },
  "payout.failed":           { category: "PAYOUT",   source: "PLATFORM", smsEnabled: false },
  "stylist.available":       { category: "STYLIST_AVAILABILITY", source: "PLATFORM", smsEnabled: false },
  "stylist.waitlist_available": { category: "STYLIST_AVAILABILITY", source: "PLATFORM", smsEnabled: false },
  "order.shipped":           { category: "ORDER",    source: "PLATFORM", smsEnabled: true  },
  "order.arrived":           { category: "ORDER",    source: "PLATFORM", smsEnabled: true  },
  "order.return_initiated":  { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "order.refunded":          { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "subscription.retry_failed": { category: "SUBSCRIPTION", source: "PLATFORM", smsEnabled: true  },
  "affiliate.purchase_check": { category: "AFFILIATE", source: "PLATFORM", smsEnabled: false },
};
```

SMS enabled on 8 events total (5 stylist-bound, 3 client-bound). All other events are bell + toast + email only.

## Dispatcher integration

`src/lib/notifications/dispatcher.ts::dispatchNotification` is the single fan-out point. The current shape (`event`, `userId`, `title`, `body`, `url?`, `emailProperties?`) stays unchanged so all 28 existing dispatch sites are untouched. Internally:

1. **Persist Notification row first** (no try/catch — fail loud if the in-app surface can't land).
2. **Email via Klaviyo** (existing path, individual `.catch` so a Klaviyo outage never blocks the row write or SMS).
3. **SMS via Twilio** if `event ∈ smsEnabled && shouldSend("SMS")` and the user has a verified `phoneNumber`. Individual `.catch`.

Web Push branch (`sendPushNotification` call) is removed.

`NotificationPreference` semantics are preserved exactly: per `(userId, channel, category)` opt-out, default-on for transactional events, `category` is the dispatcher event string (e.g. `"tip.received"`).

## SMS templates

`src/lib/notifications/sms-templates.ts` exports a `Record<NotificationEvent, (input: DispatchInput, user: User) => string | null>` — only smsEnabled events have entries. Templates:

```
tip.received          "Wishi: ${client.firstName} tipped you $${dollars} 🎉 ${url}"
session.booked        "Wishi: New ${planName} booking from ${client.firstName} ${client.lastName.charAt(0)}. ${url}"
session.activated     "Wishi: ${client.firstName} just messaged you. Start styling: ${url}"
session.overdue       "Wishi: Reminder — ${client.firstName} is waiting on you. ${url}"
payout.completed      "Wishi: Payout of $${dollars} sent to your bank ✓"
order.shipped         "Wishi: Your order has shipped 📦 Track it: ${url}"
order.arrived         "Wishi: Your order arrived. 14 days to return anything: ${url}"
subscription.retry_failed "Wishi: We couldn't bill your subscription. Update payment: ${url}"
```

All ≤ 160 chars in worst case. `url` is a fully qualified `https://` URL produced by `getAppUrl(input.url)`. Templates rely on `input.emailProperties` for the substitution variables; missing required properties → log warning, skip SMS (don't crash dispatcher).

`src/lib/notifications/sms.ts` wraps `twilioClient.messages.create({ from: TWILIO_SMS_FROM, to: user.phoneNumber, body })` with idempotency-friendly logging. Skips when `phoneNumber` is null/empty (no error). Reuses the existing Twilio client (`src/lib/twilio.ts`).

## API

All routes use `getServerAuth()` from `src/lib/auth/server-auth.ts`, export `const dynamic = "force-dynamic"`, and 401 on no auth.

| Route | Method | Returns |
|---|---|---|
| `/api/notifications` | GET | `{ items: Notification[50], unreadCount: number, latestId: string \| null }` newest first |
| `/api/notifications/[id]/read` | POST | `{ readAt: string }` — idempotent, ownership-checked |
| `/api/notifications/read-all` | POST | `{ count: number }` — `updateMany({ userId, readAt: null }, { readAt: now() })` |

`items` is capped at 50 (the popover's visible scroll). The bell badge uses `unreadCount` directly so it remains accurate even when older unread notifications fall off the 50-item window.

## UI rewire

### `useNotifications()` hook (new)

`src/lib/notifications/use-notifications.ts` (client-only).

- Fetches `GET /api/notifications` on mount, every 10 s, and on dropdown open (with debounce).
- Tracks `maxSeenId` in a ref. **The first successful fetch establishes the baseline — no toast fires for backlog.**
- Each subsequent fetch: any item with `id > maxSeenId` triggers `toast(item.title, { description: item.body, action: { label: "View", onClick: () => { markRead(item.id); router.push(item.href); } } })` via sonner. Updates `maxSeenId`.
- Exposes `{ items, unreadCount, markRead(id), markAllRead() }`. `markRead` is optimistic + POST.
- Unmounts cleanly (clearInterval).

### `NotificationsPopover` rewrite

`src/components/notifications/notifications-popover.tsx` (moved from `src/components/stylist/`).

- Replaces `useState(mockNotifications)` with `useNotifications()`.
- Adds prop `counterpartyLabel: "Clients" | "Stylists"` for the tab filter label.
- Existing tabs (All / `counterpartyLabel` / Platform) filter by `source` (CLIENT vs PLATFORM).
- "Mark all read" wires to `markAllRead()`.
- Click row → `markRead(id) + router.push(href)`.
- Icon map keyed by `NotificationCategory` enum (matches Lucide icons used in mocks).

### Mount points

- **Stylist:** existing mounts in `src/app/(stylist)/stylist/dashboard/dashboard-client.tsx:936` and `src/components/nav/stylist-top-bar.tsx:51` updated to `<NotificationsPopover counterpartyLabel="Clients" />`.
- **Client:** new mount in the client top bar, between the "My Style Sessions" CTA and the cart icon. Implementation phase locates the exact file (likely `src/components/nav/client-top-bar.tsx` or the equivalent `(client)` group layout). Renders `<NotificationsPopover counterpartyLabel="Stylists" />`.

## Web Push purge

Hard-delete all of:

- `src/lib/web-push.ts`
- `src/app/api/push/subscribe/route.ts`
- `src/app/api/push/vapid-key/route.ts` (whole `src/app/api/push/` directory)
- `src/components/chat/push-permission.tsx`
- The `<PushPermission />` mount at `src/app/(client-fullbleed)/sessions/[id]/chat/page.tsx:122` and the import on line 6
- `PushSubscription` Prisma model (line ~1340) and `pushSubscriptions PushSubscription[]` back-relation on `User` (line ~389)
- `web-push` npm dependency in `package.json`
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (or whatever variants exist) from `.env.example`
- Service worker file in `public/` if it was registered solely for push (verified in implementation; if it serves other purposes, leave it and strip just the push subscription handlers)

Migration: drop `push_subscriptions` table.

## Mock data purge

Hard-delete `src/data/notifications.ts`. Grep for residual imports of `mockNotifications` / `AppNotification` / `formatRelative` and clean up. `formatRelative` moves into `src/lib/notifications/format.ts` (used by the popover).

## Tests

### Unit
- `tests/notifications-dispatcher.test.ts` — `dispatchNotification({ event: "tip.received", … })` writes a `Notification` row with `category=TIP`, `source=CLIENT`. SMS path fires for smsEnabled events with a phone number, skips silently without one. Email + SMS errors do not block the row write.
- `tests/notification-event-meta.test.ts` — TS-enforced exhaustiveness over `NotificationEvent` union; runtime check that no event maps to undefined category.
- `tests/notifications-sms-templates.test.ts` — every smsEnabled event has a template; templates render < 160 chars given typical payloads; missing `emailProperties` returns null gracefully.

### Integration
- Extend `tests/payout-webhooks.test.ts` tip case to also assert `Notification(category=TIP, userId=stylist)` row exists after `handleTipPaymentSucceeded`.

### E2E
- `tests/e2e/stylist-notifications.spec.ts` — seed `Notification` row directly via `tests/e2e/db.ts`, sign in as stylist via `E2E_AUTH_MODE`, open dashboard, click bell, assert title/body/icon, click row, assert navigation to `href` + `readAt` set + unread badge clears. Then "Mark all read" path.
- `tests/e2e/client-notifications.spec.ts` — same shape, mounted on the client top bar between My Style Sessions and cart.
- `tests/e2e/notifications-toast.spec.ts` — open dashboard, insert a Notification row mid-session via the e2e DB helper, wait for next poll cycle, assert sonner toast renders with expected title/body and action button. Click action → assert navigation.

## Documentation updates

- **`CLAUDE.md`** — add a new key-conventions block: "Notifications — `dispatchNotification()` is the single fan-out point. Writes a `Notification` row first (fail-fast), then fans out to email (Klaviyo, all events) + SMS (Twilio, 8 events listed in `event-meta.ts`). The stylist + client bells (`NotificationsPopover`) read `/api/notifications` on a 10 s poll and surface new arrivals as sonner toasts. No Web Push." Update the existing **Tip flow** entry to mention the durable `Notification` row.
- **`README.md`** — add `TWILIO_SMS_FROM` env var if not already present; remove any VAPID env var references.
- **`.env.example`** — add `TWILIO_SMS_FROM`, remove VAPID keys.
- **`WISHI-LAUNCH-PREP.md`** — close the corresponding Track item (located in implementation phase).
- **Notion roadmap** — flip the corresponding row to Done via the `notion` CLI per the standard cleanup flow.

## Migration order

1. Prisma migration: add `Notification` model + enums; drop `PushSubscription`.
2. Land `event-meta.ts` + dispatcher rewrite + SMS sender + tests behind no UI changes (server-side ready, bell still on mocks).
3. Land API routes + tests.
4. Land `useNotifications()` hook + `NotificationsPopover` rewrite + both mount points + e2e tests.
5. Delete `src/data/notifications.ts`.
6. Delete Web Push files + chat-page mount.
7. Delete `web-push` npm dep + VAPID env vars.
8. Doc updates + Notion flip.

Each step ships in its own commit on a single PR branch. Branch name: `real-notifications`.

## Risks and mitigations

- **10 s polling load** — at 100 active concurrent users, ~600 req/min on `/api/notifications`. Trivial for the existing Next.js + RDS Proxy setup. Index `(userId, createdAt DESC)` covers the query. If it ever bites, raise interval per role or move to SSE.
- **SMS cost / spam** — bounded to 8 high-value events. NotificationPreference per-event opt-out exists at the dispatcher layer. No bulk-message events in the SMS allowlist.
- **Lost real-time push** — dropping Web Push removes the only OS-level "Wishi tab is closed, ping me" channel. SMS covers the highest-stakes events; email covers the rest. If stylists report missed tips at scale, layer Pusher in a follow-up phase.
- **Service worker collateral** — if the SW serves any non-push function (offline cache, asset preloading), targeted strip-and-keep instead of full delete. Verified in implementation.
- **Migration safety** — `Notification` is purely additive; `PushSubscription` drop will fail loud if any code still references it. Prisma generate after the migration surfaces all stragglers.
