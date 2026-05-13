import assert from "node:assert/strict";
import test from "node:test";
import { NOTIFICATION_EVENT_META } from "../src/lib/notifications/event-meta";
import type { NotificationEvent } from "../src/lib/notifications/dispatcher";

const ALL_EVENTS: NotificationEvent[] = [
  "affiliate.purchase_check",
  "moodboard.sent",
  "moodboard.feedback",
  "styleboard.sent",
  "styleboard.reviewed",
  "restyle.sent",
  "session.activated",
  "session.booked",
  "session.cancelled",
  "session.end_requested",
  "session.end_declined",
  "session.end_approved",
  "session.overdue",
  "session.auto_completed",
  "tip.received",
  "rating.posted",
  "payout.queued",
  "payout.completed",
  "payout.failed",
  "stylist.available",
  "stylist.waitlist_available",
  "order.shipped",
  "order.arrived",
  "order.return_initiated",
  "order.refunded",
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
