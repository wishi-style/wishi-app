// Unit tests for the EasyPost integration — client payload shape, tracker
// status → order status mapping, and webhook signature verification.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  createEasyPostClient,
  EasyPostError,
  trackerStatusToOrderStatus,
  verifyEasyPostWebhookSignature,
} from "@/lib/integrations/easypost";

type Call = { url: string; init: RequestInit | undefined };

function makeFetch(
  response: { ok: boolean; status?: number; text?: string; json?: unknown },
): { fetch: typeof globalThis.fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      text: async () => response.text ?? JSON.stringify(response.json ?? {}),
      json: async () => response.json ?? JSON.parse(response.text ?? "{}"),
    } as Response;
  }) as typeof globalThis.fetch;
  return { fetch: fetchImpl, calls };
}

test("createTracker posts tracking_code + carrier to EasyPost /v2/trackers", async () => {
  const { fetch, calls } = makeFetch({
    ok: true,
    json: {
      id: "trk_abc",
      tracking_code: "9400111899223445566677",
      carrier: "USPS",
      status: "pre_transit",
      est_delivery_date: null,
      public_url: "https://track.easypost.com/xyz",
    },
  });
  const client = createEasyPostClient({ apiKey: "EZAK_test", fetchImpl: fetch });

  const tracker = await client.createTracker({
    trackingCode: "9400111899223445566677",
    carrier: "USPS",
  });

  assert.equal(tracker.id, "trk_abc");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.easypost.com/v2/trackers");
  assert.equal(calls[0].init?.method, "POST");

  const headers = calls[0].init?.headers as Record<string, string>;
  const expectedAuth = `Basic ${Buffer.from("EZAK_test:").toString("base64")}`;
  assert.equal(headers.Authorization, expectedAuth);
  assert.equal(headers["content-type"], "application/json");

  const body = JSON.parse(calls[0].init?.body as string);
  assert.deepEqual(body, {
    tracker: { tracking_code: "9400111899223445566677", carrier: "USPS" },
  });
});

test("createTracker throws EasyPostError when API key is unset", async () => {
  const { fetch } = makeFetch({ ok: true });
  const client = createEasyPostClient({ apiKey: undefined, fetchImpl: fetch });
  await assert.rejects(
    () => client.createTracker({ trackingCode: "X", carrier: "USPS" }),
    (err: unknown) =>
      err instanceof EasyPostError && err.status === 0 && /API_KEY/.test(err.message),
  );
});

test("createTracker throws EasyPostError with status on HTTP error", async () => {
  const { fetch } = makeFetch({
    ok: false,
    status: 422,
    text: '{"error":{"message":"invalid carrier"}}',
  });
  const client = createEasyPostClient({ apiKey: "EZAK_test", fetchImpl: fetch });
  await assert.rejects(
    () => client.createTracker({ trackingCode: "X", carrier: "NOPE" }),
    (err: unknown) =>
      err instanceof EasyPostError &&
      err.status === 422 &&
      err.message.includes("invalid carrier"),
  );
});

test("trackerStatusToOrderStatus: in_transit + out_for_delivery → SHIPPED", () => {
  assert.equal(trackerStatusToOrderStatus("in_transit"), "SHIPPED");
  assert.equal(trackerStatusToOrderStatus("out_for_delivery"), "SHIPPED");
});

test("trackerStatusToOrderStatus: delivered + available_for_pickup → ARRIVED", () => {
  assert.equal(trackerStatusToOrderStatus("delivered"), "ARRIVED");
  assert.equal(trackerStatusToOrderStatus("available_for_pickup"), "ARRIVED");
});

test("trackerStatusToOrderStatus: exceptional states → null (no auto-transition)", () => {
  assert.equal(trackerStatusToOrderStatus("pre_transit"), null);
  assert.equal(trackerStatusToOrderStatus("return_to_sender"), null);
  assert.equal(trackerStatusToOrderStatus("failure"), null);
  assert.equal(trackerStatusToOrderStatus("cancelled"), null);
  assert.equal(trackerStatusToOrderStatus("error"), null);
  assert.equal(trackerStatusToOrderStatus("unknown"), null);
});

test("verifyEasyPostWebhookSignature: valid HMAC-SHA256 over raw body", () => {
  const secret = "whs_test_xyz";
  const rawBody = '{"id":"evt_1","description":"tracker.updated"}';
  const sig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  assert.equal(
    verifyEasyPostWebhookSignature({ rawBody, signatureHeader: sig, secret }),
    true,
  );
});

test("verifyEasyPostWebhookSignature: strips 'hex=' and 'sha256=' prefixes", () => {
  const secret = "whs";
  const rawBody = '{"a":1}';
  const sig = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  assert.equal(
    verifyEasyPostWebhookSignature({
      rawBody,
      signatureHeader: `hex=${sig}`,
      secret,
    }),
    true,
  );
  assert.equal(
    verifyEasyPostWebhookSignature({
      rawBody,
      signatureHeader: `sha256=${sig}`,
      secret,
    }),
    true,
  );
});

test("verifyEasyPostWebhookSignature: rejects wrong signature + missing header", () => {
  const rawBody = '{"a":1}';
  assert.equal(
    verifyEasyPostWebhookSignature({
      rawBody,
      signatureHeader: "not-a-real-sig",
      secret: "s",
    }),
    false,
  );
  assert.equal(
    verifyEasyPostWebhookSignature({
      rawBody,
      signatureHeader: null,
      secret: "s",
    }),
    false,
  );
});

test("verifyEasyPostWebhookSignature: rejects signature computed with wrong secret", () => {
  const rawBody = '{"a":1}';
  const sig = crypto.createHmac("sha256", "wrong").update(rawBody, "utf8").digest("hex");
  assert.equal(
    verifyEasyPostWebhookSignature({
      rawBody,
      signatureHeader: sig,
      secret: "right",
    }),
    false,
  );
});
