import { getKlaviyoClient, type KlaviyoProfile } from "@/lib/integrations/klaviyo";

/**
 * Send a transactional email via Klaviyo without a Wishi user account.
 * Used when the recipient is a bare email address (gift-card recipient,
 * invite outreach). For user-scoped notifications use
 * `dispatchNotification` — that path respects `NotificationPreference`
 * rows and fans out to push as well.
 */
export async function sendTransactionalEmail(input: {
  event: string;
  profile: KlaviyoProfile;
  properties?: Record<string, unknown>;
}): Promise<void> {
  const result = await getKlaviyoClient()
    .trackEvent({
      event: input.event,
      profile: input.profile,
      properties: input.properties,
    })
    .catch((err) => {
      console.warn(`[notifications] klaviyo transactional ${input.event} threw:`, err);
      return { delivered: false, reason: "threw" as const };
    });

  if (!result.delivered && result.reason && result.reason !== "no_api_key") {
    console.warn(
      `[notifications] klaviyo transactional ${input.event} not delivered:`,
      result.reason,
    );
  }
}
