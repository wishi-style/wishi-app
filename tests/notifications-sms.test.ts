import assert from "node:assert/strict";
import test from "node:test";
import { renderSmsBody } from "../src/lib/notifications/sms-templates";

test("tip.received template renders with dollars + first name + url", () => {
  const body = renderSmsBody(
    {
      event: "tip.received",
      userId: "u1",
      title: "ignored",
      body: "ignored",
      url: "https://wishi.me/stylist/dashboard?session=s1",
      emailProperties: { tipInCents: 2500, firstName: "Olivia" },
    },
    { firstName: "Stylist" },
  );
  assert.ok(body);
  assert.match(body, /Olivia tipped you \$25/);
  assert.match(body, /https:\/\/wishi\.me\/stylist\/dashboard/);
  assert.ok(body.length <= 160, `body too long: ${body.length}`);
});

test("session.booked template uses plan name and firstName", () => {
  const body = renderSmsBody(
    {
      event: "session.booked",
      userId: "u1",
      title: "x",
      body: "x",
      url: "https://wishi.me/stylist/dashboard",
      emailProperties: { planName: "Premium", firstName: "Mia" },
    },
    { firstName: "Stylist" },
  );
  assert.ok(body);
  assert.match(body, /New Premium booking from Mia/);
});

test("payout.completed template formats dollars", () => {
  const body = renderSmsBody(
    {
      event: "payout.completed",
      userId: "u1",
      title: "x",
      body: "x",
      emailProperties: { amountInCents: 5275 },
    },
    { firstName: "Stylist" },
  );
  assert.equal(body, "Wishi: Payout of $52.75 sent to your bank ✓");
});

test("non-sms-enabled events return null", () => {
  const body = renderSmsBody(
    {
      event: "moodboard.sent",
      userId: "u1",
      title: "x",
      body: "x",
    },
    { firstName: "Client" },
  );
  assert.equal(body, null);
});

test("missing required emailProperties returns null gracefully", () => {
  const body = renderSmsBody(
    {
      event: "tip.received",
      userId: "u1",
      title: "x",
      body: "x",
    },
    { firstName: "Stylist" },
  );
  assert.equal(body, null);
});

test("all 8 SMS-enabled events produce a body when given full inputs", () => {
  const url = "https://wishi.me/x";
  const cases: Array<{ event: string; props: Record<string, unknown> }> = [
    { event: "tip.received", props: { tipInCents: 1000, firstName: "A" } },
    { event: "session.booked", props: { planName: "Mini", firstName: "B" } },
    { event: "session.activated", props: { firstName: "C" } },
    { event: "session.overdue", props: { firstName: "D" } },
    { event: "payout.completed", props: { amountInCents: 1234 } },
    { event: "order.shipped", props: {} },
    { event: "order.arrived", props: {} },
    { event: "subscription.retry_failed", props: {} },
  ];
  for (const { event, props } of cases) {
    const body = renderSmsBody(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { event: event as any, userId: "u", title: "x", body: "x", url, emailProperties: props },
      { firstName: "User" },
    );
    assert.ok(body, `expected SMS body for ${event}`);
    assert.ok(body.startsWith("Wishi:"), `${event} should start with "Wishi:"`);
  }
});
