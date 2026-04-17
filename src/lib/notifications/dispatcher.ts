import { prisma } from "@/lib/prisma";
import { sendPushNotification } from "@/lib/web-push";

export type NotificationEvent =
  | "moodboard.sent"
  | "moodboard.feedback"
  | "styleboard.sent"
  | "styleboard.reviewed"
  | "restyle.sent"
  | "session.end_requested"
  | "session.end_declined"
  | "session.overdue"
  | "session.auto_completed"
  | "stylist.waitlist_available";

export interface DispatchInput {
  event: NotificationEvent;
  userId: string;
  title: string;
  body: string;
  url?: string;
}

/**
 * Fan out a notification for the given event. Today this is Web Push only;
 * Klaviyo email/SMS lands in Phase 9 and will plug in here.
 */
export async function dispatchNotification(input: DispatchInput): Promise<void> {
  const prefs = await prisma.notificationPreference.findMany({
    where: { userId: input.userId, category: input.event, isEnabled: true },
  });
  const channels = new Set(prefs.map((p) => p.channel));
  // Default: if no prefs rows exist, treat as opted-in to push for sanity.
  const sendPush = prefs.length === 0 || channels.has("PUSH");

  if (sendPush) {
    await sendPushNotification(input.userId, {
      title: input.title,
      body: input.body,
      url: input.url,
    }).catch((err) => console.warn("[notifications] push failed:", err));
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
