import crypto from "node:crypto";

/**
 * EasyPost API client — minimal surface we actually need. For Phase 11 we
 * only consume the Tracker API: create a tracker when admin pastes a
 * tracking number so EasyPost fans webhook events as carrier scans land.
 * Label purchase (`createShipment` / `buyLabel`) is intentionally out of
 * scope for v1; admin still sources labels from the retailer.
 *
 * Docs: https://docs.easypost.com/docs/trackers
 */

const EASYPOST_API_URL = "https://api.easypost.com/v2";

export type EasyPostTrackerStatus =
  | "pre_transit"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "available_for_pickup"
  | "return_to_sender"
  | "failure"
  | "cancelled"
  | "error"
  | "unknown";

export interface EasyPostTracker {
  id: string;
  tracking_code: string;
  carrier: string;
  status: EasyPostTrackerStatus;
  est_delivery_date: string | null;
  public_url: string | null;
}

export interface EasyPostEvent {
  id: string;
  object: "Event";
  description: string; // e.g. "tracker.updated"
  result: EasyPostTracker;
}

export type EasyPostFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface EasyPostClient {
  createTracker(input: {
    trackingCode: string;
    carrier: string;
  }): Promise<EasyPostTracker>;
}

export interface EasyPostClientOptions {
  apiKey?: string;
  fetchImpl?: EasyPostFetch;
}

export class EasyPostError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EasyPostError";
  }
}

export function createEasyPostClient(
  opts: EasyPostClientOptions = {},
): EasyPostClient {
  const apiKey = opts.apiKey ?? process.env.EASYPOST_API_KEY;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  return {
    async createTracker(input) {
      if (!apiKey) {
        throw new EasyPostError("EASYPOST_API_KEY is not set", 0);
      }
      const auth = Buffer.from(`${apiKey}:`).toString("base64");
      const res = await fetchImpl(`${EASYPOST_API_URL}/trackers`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          tracker: {
            tracking_code: input.trackingCode,
            carrier: input.carrier,
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new EasyPostError(
          `EasyPost createTracker failed: ${res.status}${text ? ` — ${text.slice(0, 200)}` : ""}`,
          res.status,
        );
      }
      return (await res.json()) as EasyPostTracker;
    },
  };
}

const globalForEasyPost = globalThis as unknown as {
  easypost?: EasyPostClient;
};

export function getEasyPostClient(): EasyPostClient {
  if (!globalForEasyPost.easypost) {
    globalForEasyPost.easypost = createEasyPostClient();
  }
  return globalForEasyPost.easypost;
}

/**
 * Verify the HMAC-SHA256 signature EasyPost sends in the `X-Hmac-Signature`
 * request header. Uses a timing-safe compare. Returns true when the secret
 * is unset + we're in development — deployed envs must set the secret
 * (caller enforces that side).
 */
export function verifyEasyPostWebhookSignature(args: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  if (!args.signatureHeader) return false;
  const expected = crypto
    .createHmac("sha256", args.secret)
    .update(args.rawBody, "utf8")
    .digest("hex");

  // EasyPost docs note the header value may be prefixed (e.g. "hex=..."),
  // so we strip a single common prefix before comparing.
  const received = args.signatureHeader.replace(/^(hex=|sha256=)/, "");

  if (received.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(received, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Map an EasyPost tracker status to the Wishi `OrderStatus` target we want
 * the order to settle at. Returns `null` when the status should NOT trigger
 * an automatic transition (caller keeps the current status and optionally
 * flags the order for human review).
 */
export function trackerStatusToOrderStatus(
  status: EasyPostTrackerStatus,
): "SHIPPED" | "ARRIVED" | null {
  switch (status) {
    case "in_transit":
    case "out_for_delivery":
      return "SHIPPED";
    case "delivered":
    case "available_for_pickup":
      return "ARRIVED";
    case "pre_transit":
    case "return_to_sender":
    case "failure":
    case "cancelled":
    case "error":
    case "unknown":
      return null;
  }
}
