import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/web-push";
import { getKlaviyoClient } from "@/lib/integrations/klaviyo";

export type NotificationEvent =
  | "affiliate.purchase_check"
  | "moodboard.sent"
  | "moodboard.feedback"
  | "styleboard.sent"
  | "styleboard.reviewed"
  | "restyle.sent"
  | "session.end_requested"
  | "session.end_declined"
  | "session.overdue"
  | "session.auto_completed"
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
  /**
   * Extra key-values to attach to the Klaviyo event for template
   * personalization (order total, plan name, etc.). Push payload is not
   * extended — push stays minimal by design.
   */
  emailProperties?: Record<string, unknown>;
}

/**
 * Fan a notification out across the channels the user has enabled.
 * `NotificationPreference` is source-of-truth per (userId, channel, category).
 * Channels with no preference row fall back to enabled — transactional events
 * should reach the user by default. Delivery failures are logged but do not
 * abort callers.
 */
export async function dispatchNotification(input: DispatchInput): Promise<void> {
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: input.userId, category: input.event },
    select: { channel: true, isEnabled: true },
  });
  const enabledChannels = new Set(
    prefs.filter((p) => p.isEnabled).map((p) => p.channel),
  );
  const explicitlyDisabled = new Set(
    prefs.filter((p) => !p.isEnabled).map((p) => p.channel),
  );
  const shouldSend = (channel: "PUSH" | "EMAIL" | "SMS") =>
    enabledChannels.has(channel) ||
    (!explicitlyDisabled.has(channel) && prefs.length === 0);
  // Mixed case: some prefs exist but not for this channel. Default to on for
  // transactional events — opt-out is explicit, not silent.
  const shouldSendWithFallback = (channel: "PUSH" | "EMAIL" | "SMS") =>
    enabledChannels.has(channel) || !explicitlyDisabled.has(channel);

  const sendPush = shouldSendWithFallback("PUSH");
  const sendEmail = shouldSend("EMAIL") || shouldSendWithFallback("EMAIL");

  const tasks: Promise<unknown>[] = [];

  if (sendPush) {
    tasks.push(
      sendPushNotification(input.userId, {
        title: input.title,
        body: input.body,
        url: input.url,
      }).catch((err) => {
        console.warn(`[notifications] push failed for ${input.event}:`, err);
      }),
    );
  }

  if (sendEmail) {
    tasks.push(sendEmailViaKlaviyo(input));
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
