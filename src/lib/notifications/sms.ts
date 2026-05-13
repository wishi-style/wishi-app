import { twilioClient } from "@/lib/twilio";
import { prisma } from "@/lib/prisma";
import { renderSmsBody } from "./sms-templates";
import type { DispatchInput } from "./dispatcher";

/**
 * Send a transactional SMS for an SMS-enabled NotificationEvent.
 *
 * No-ops silently when:
 *   - the user has no phone number on file
 *   - the event has no SMS template / is not in the SMS allowlist
 *
 * Logs a warning + no-ops when TWILIO_SMS_FROM is not configured (it's
 * an ops misconfiguration, not a per-user state, so the warning helps
 * catch it in CloudWatch).
 *
 * Failures from Twilio are caught by the dispatcher's per-channel
 * `.catch`, so they never abort the caller.
 */
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

  await twilioClient.messages.create({ to: user.phone, from, body });
}
