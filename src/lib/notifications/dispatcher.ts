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
  | "order.confirmed"
  | "order.partially_fulfilled"
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
  /**
   * Extra key-values to attach to the Klaviyo event for template
   * personalization (order total, plan name, etc.) and as the
   * source of substitution variables for the SMS templates.
   */
  emailProperties?: Record<string, unknown>;
}

/**
 * Fan a notification out across the channels enabled for this user.
 *
 * Order:
 *   1. Persist Notification row (fail-fast — the in-app surface is the
 *      catch-up channel and must never be silently lost).
 *   2. Klaviyo email (best-effort, per-channel .catch).
 *   3. Twilio SMS for events in the SMS allowlist (best-effort).
 *
 * `NotificationPreference` is source-of-truth per (userId, channel,
 * category). Channels with no preference row default to enabled —
 * transactional events should reach the user by default.
 */
export async function dispatchNotification(input: DispatchInput): Promise<void> {
  const meta = NOTIFICATION_EVENT_META[input.event];

  // 1. In-app row first. Errors propagate.
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

  // 2. Resolve per-channel preferences.
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: input.userId, category: input.event },
    select: { channel: true, isEnabled: true },
  });
  const enabled = new Set(prefs.filter((p) => p.isEnabled).map((p) => p.channel));
  const explicitlyDisabled = new Set(
    prefs.filter((p) => !p.isEnabled).map((p) => p.channel),
  );
  const shouldSend = (channel: "EMAIL" | "SMS") =>
    enabled.has(channel) || !explicitlyDisabled.has(channel);

  const tasks: Promise<unknown>[] = [];

  if (shouldSend("EMAIL")) {
    tasks.push(
      sendEmailViaKlaviyo(input).catch((err) => {
        console.warn(`[notifications] email failed for ${input.event}:`, err);
      }),
    );
  }

  if (meta.smsEnabled && shouldSend("SMS")) {
    tasks.push(
      sendSmsForEvent(input).catch((err) => {
        console.warn(`[notifications] sms failed for ${input.event}:`, err);
      }),
    );
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

export async function notifyClient(
  sessionId: string,
  input: Omit<DispatchInput, "userId">,
): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { clientId: true },
  });
  if (!session) return;
  await dispatchNotification({ ...input, userId: session.clientId });
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
