// Unit tests for the Klaviyo Events API client. Uses a fake fetch so no
// network calls are made — verifies payload shape and delivery-flag semantics.

import assert from "node:assert/strict";
import test from "node:test";
import { createKlaviyoClient } from "@/lib/integrations/klaviyo";

type Call = { url: string; init: RequestInit | undefined };

function makeFetch(
  response: { ok: boolean; status?: number; text?: string },
): { fetch: typeof globalThis.fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 202 : 500),
      text: async () => response.text ?? "",
    } as Response;
  }) as typeof globalThis.fetch;
  return { fetch: fetchImpl, calls };
}

test("trackEvent returns no_api_key when key is missing", async () => {
  const { fetch } = makeFetch({ ok: true });
  const client = createKlaviyoClient({ apiKey: undefined, fetchImpl: fetch });
  const result = await client.trackEvent({
    event: "order.shipped",
    profile: { email: "a@b.com" },
  });
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "no_api_key");
});

test("trackEvent posts JSON:API payload with metric, profile, properties", async () => {
  const { fetch, calls } = makeFetch({ ok: true });
  const client = createKlaviyoClient({ apiKey: "pk_test_xxx", fetchImpl: fetch });

  const when = new Date("2026-04-22T20:00:00Z");
  const result = await client.trackEvent({
    event: "order.shipped",
    profile: {
      email: "client@example.com",
      externalId: "usr_abc",
      firstName: "Daisy",
      lastName: "Smith",
    },
    properties: { orderId: "ord_1", totalInCents: 12_000 },
    value: 120,
    time: when,
  });

  assert.equal(result.delivered, true);
  assert.equal(calls.length, 1);

  const call = calls[0];
  assert.equal(call.url, "https://a.klaviyo.com/api/events");
  assert.equal(call.init?.method, "POST");

  const headers = call.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Klaviyo-API-Key pk_test_xxx");
  assert.equal(headers.revision, "2024-10-15");
  assert.equal(headers.accept, "application/vnd.api+json");
  assert.equal(headers["content-type"], "application/vnd.api+json");

  const body = JSON.parse(call.init?.body as string);
  assert.equal(body.data.type, "event");
  // Metric name is humanized (order.shipped → "Order Shipped")
  assert.equal(body.data.attributes.metric.data.attributes.name, "Order Shipped");
  assert.equal(body.data.attributes.profile.data.attributes.email, "client@example.com");
  assert.equal(body.data.attributes.profile.data.attributes.external_id, "usr_abc");
  assert.equal(body.data.attributes.profile.data.attributes.first_name, "Daisy");
  assert.equal(body.data.attributes.profile.data.attributes.last_name, "Smith");
  assert.deepEqual(body.data.attributes.properties, {
    orderId: "ord_1",
    totalInCents: 12_000,
  });
  assert.equal(body.data.attributes.value, 120);
  assert.equal(body.data.attributes.time, "2026-04-22T20:00:00.000Z");
});

test("trackEvent omits optional profile fields that are undefined", async () => {
  const { fetch, calls } = makeFetch({ ok: true });
  const client = createKlaviyoClient({ apiKey: "pk", fetchImpl: fetch });

  await client.trackEvent({
    event: "gift-card.delivered",
    profile: { email: "friend@example.com" },
  });

  const body = JSON.parse(calls[0].init?.body as string);
  const profileAttrs = body.data.attributes.profile.data.attributes;
  assert.equal(profileAttrs.email, "friend@example.com");
  assert.equal(profileAttrs.external_id, undefined);
  assert.equal(profileAttrs.first_name, undefined);
  assert.equal(profileAttrs.last_name, undefined);
});

test("trackEvent humanizes compound event names", async () => {
  const { fetch, calls } = makeFetch({ ok: true });
  const client = createKlaviyoClient({ apiKey: "pk", fetchImpl: fetch });

  await client.trackEvent({
    event: "subscription.retry_failed",
    profile: { email: "a@b.com" },
  });
  const body = JSON.parse(calls[0].init?.body as string);
  assert.equal(
    body.data.attributes.metric.data.attributes.name,
    "Subscription Retry Failed",
  );
});

test("trackEvent reports http_<status> when Klaviyo rejects", async () => {
  const { fetch } = makeFetch({
    ok: false,
    status: 400,
    text: '{"errors":[{"detail":"bad profile"}]}',
  });
  const client = createKlaviyoClient({ apiKey: "pk", fetchImpl: fetch });

  const result = await client.trackEvent({
    event: "order.shipped",
    profile: { email: "bad@example.com" },
  });
  assert.equal(result.delivered, false);
  assert.ok(result.reason?.startsWith("http_400"));
  assert.ok(result.reason?.includes("bad profile"));
});

test("trackEvent honours a custom revision", async () => {
  const { fetch, calls } = makeFetch({ ok: true });
  const client = createKlaviyoClient({
    apiKey: "pk",
    revision: "2025-01-15",
    fetchImpl: fetch,
  });
  await client.trackEvent({ event: "x.y", profile: { email: "a@b.com" } });
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers.revision, "2025-01-15");
});
