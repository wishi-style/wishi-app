// Integration test for src/lib/notifications/dispatcher.ts.
// Seeds a user, fires dispatchNotification, asserts the Notification row.
// Email + SMS branches are best-effort and will no-op without credentials —
// the assertion target is the durable in-app row.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { dispatchNotification } from "../src/lib/notifications/dispatcher";
import { prisma } from "../src/lib/prisma";
import { ensureClientUser, cleanupE2EUserByEmail } from "./e2e/db";

let userEmail: string | null = null;

afterEach(async () => {
  if (userEmail) {
    await cleanupE2EUserByEmail(userEmail);
    userEmail = null;
  }
});

function newEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 4)}@e2e.wishi.test`;
}

test("dispatchNotification persists Notification row with TIP/CLIENT", async () => {
  userEmail = newEmail("disp");
  const user = await ensureClientUser({
    clerkId: `e2e-${randomUUID()}`,
    email: userEmail,
    firstName: "Disp",
    lastName: "Test",
  });

  await dispatchNotification({
    event: "tip.received",
    userId: user.id,
    title: "You got a $25 tip",
    body: "Olivia left you a tip.",
    url: "/stylist/dashboard?session=abc",
    emailProperties: { tipInCents: 2500, firstName: "Olivia" },
  });

  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "tip.received");
  assert.equal(rows[0].category, "TIP");
  assert.equal(rows[0].source, "CLIENT");
  assert.equal(rows[0].title, "You got a $25 tip");
  assert.equal(rows[0].href, "/stylist/dashboard?session=abc");
  assert.equal(rows[0].readAt, null);
});

test("dispatchNotification handles non-sms event without crashing", async () => {
  userEmail = newEmail("disp2");
  const user = await ensureClientUser({
    clerkId: `e2e-${randomUUID()}`,
    email: userEmail,
    firstName: "Disp",
    lastName: "Two",
  });

  await dispatchNotification({
    event: "moodboard.sent",
    userId: user.id,
    title: "New moodboard",
    body: "Your stylist sent you a moodboard.",
    url: "/sessions/abc/chat",
  });

  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "MESSAGE");
  assert.equal(rows[0].source, "CLIENT");
});

test("dispatchNotification respects explicit EMAIL opt-out via NotificationPreference", async () => {
  userEmail = newEmail("disp3");
  const user = await ensureClientUser({
    clerkId: `e2e-${randomUUID()}`,
    email: userEmail,
    firstName: "Disp",
    lastName: "Three",
  });

  await prisma.notificationPreference.create({
    data: {
      userId: user.id,
      channel: "EMAIL",
      category: "session.booked",
      isEnabled: false,
    },
  });

  await dispatchNotification({
    event: "session.booked",
    userId: user.id,
    title: "New booking",
    body: "From a client",
  });

  // Notification row still lands — opt-out applies to channel fanout, not the bell.
  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, "BOOKING");
});
