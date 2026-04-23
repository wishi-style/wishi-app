/**
 * Klaviyo Events API client. Transactional email / SMS fan-out goes through
 * Klaviyo Flows — code posts an event, Klaviyo dispatches the template. Event
 * name → flow mapping is configured in the Klaviyo UI so copy iterates
 * without deploys.
 *
 * API docs: https://developers.klaviyo.com/en/reference/create_event
 */
const KLAVIYO_API_URL = "https://a.klaviyo.com/api/events";
const DEFAULT_REVISION = "2024-10-15";

export interface KlaviyoProfile {
  email: string;
  externalId?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
}

export interface KlaviyoEventInput {
  event: string;
  profile: KlaviyoProfile;
  properties?: Record<string, unknown>;
  value?: number;
  time?: Date;
}

export type KlaviyoFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface KlaviyoClient {
  trackEvent(input: KlaviyoEventInput): Promise<{ delivered: boolean; reason?: string }>;
}

export interface KlaviyoClientOptions {
  apiKey?: string;
  revision?: string;
  fetchImpl?: KlaviyoFetch;
}

function humanizeEventName(event: string): string {
  return event
    .split(/[.\-_]/)
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1)))
    .join(" ");
}

export function createKlaviyoClient(opts: KlaviyoClientOptions = {}): KlaviyoClient {
  const apiKey = opts.apiKey ?? process.env.KLAVIYO_API_KEY;
  const revision = opts.revision ?? process.env.KLAVIYO_REVISION ?? DEFAULT_REVISION;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  return {
    async trackEvent(input: KlaviyoEventInput) {
      if (!apiKey) {
        // Dev + test mode: no-op rather than throw. Log once per process
        // start would be noisier than useful — callers can wrap in their
        // own dev guard if they need visibility.
        return { delivered: false, reason: "no_api_key" };
      }

      const metricName = humanizeEventName(input.event);
      const body = {
        data: {
          type: "event",
          attributes: {
            properties: input.properties ?? {},
            ...(input.value !== undefined ? { value: input.value } : {}),
            ...(input.time ? { time: input.time.toISOString() } : {}),
            metric: {
              data: {
                type: "metric",
                attributes: { name: metricName },
              },
            },
            profile: {
              data: {
                type: "profile",
                attributes: {
                  email: input.profile.email,
                  ...(input.profile.externalId
                    ? { external_id: input.profile.externalId }
                    : {}),
                  ...(input.profile.firstName
                    ? { first_name: input.profile.firstName }
                    : {}),
                  ...(input.profile.lastName
                    ? { last_name: input.profile.lastName }
                    : {}),
                  ...(input.profile.phoneNumber
                    ? { phone_number: input.profile.phoneNumber }
                    : {}),
                },
              },
            },
          },
        },
      };

      const res = await fetchImpl(KLAVIYO_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Klaviyo-API-Key ${apiKey}`,
          revision,
          accept: "application/vnd.api+json",
          "content-type": "application/vnd.api+json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          delivered: false,
          reason: `http_${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
        };
      }
      return { delivered: true };
    },
  };
}

const globalForKlaviyo = globalThis as unknown as { klaviyo?: KlaviyoClient };

export function getKlaviyoClient(): KlaviyoClient {
  if (!globalForKlaviyo.klaviyo) {
    globalForKlaviyo.klaviyo = createKlaviyoClient();
  }
  return globalForKlaviyo.klaviyo;
}
