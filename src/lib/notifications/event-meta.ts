import type { NotificationEvent } from "./dispatcher";
import type {
  NotificationCategory,
  NotificationSource,
} from "@/generated/prisma/client";

/**
 * Single source of truth mapping each dispatcher event to its display
 * category, popover-tab source, and whether the event triggers SMS.
 *
 * The TS-exhaustive `Record<NotificationEvent, …>` shape ensures every
 * event in the dispatcher's union has a row here — adding a new event
 * to the dispatcher without updating this map is a compile error.
 */
export const NOTIFICATION_EVENT_META: Record<
  NotificationEvent,
  {
    category: NotificationCategory;
    source: NotificationSource;
    smsEnabled: boolean;
  }
> = {
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
  "order.confirmed":           { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "order.partially_fulfilled": { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "order.shipped":             { category: "ORDER",    source: "PLATFORM", smsEnabled: true  },
  "order.arrived":             { category: "ORDER",    source: "PLATFORM", smsEnabled: true  },
  "order.return_initiated":    { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "order.refunded":            { category: "ORDER",    source: "PLATFORM", smsEnabled: false },
  "subscription.retry_failed": { category: "SUBSCRIPTION", source: "PLATFORM", smsEnabled: true  },
  "affiliate.purchase_check":  { category: "AFFILIATE", source: "PLATFORM", smsEnabled: false },
};
