// Integration test for switchSubscriptionFrequency — DB-only path (no Stripe call).

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { switchSubscriptionFrequency } from "@/lib/payments/subscription-actions";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  getPool,
} from "./e2e/db";

type Client = { id: string; email: string };
let client: Client | null = null;
function assertClient(c: Client | null): asserts c is Client {
  if (!c) throw new Error("test fixture not initialized");
}

afterEach(async () => {
  if (client) {
    await getPool().query(
      "DELETE FROM subscriptions WHERE user_id = $1",
      [client.id]
    );
    await cleanupE2EUserByEmail(client.email);
    client = null;
  }
});

async function createSubscription(opts: {
  userId: string;
  status?: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";
  frequency?: "MONTHLY" | "QUARTERLY";
}) {
  const id = randomUUID();
  const status = opts.status ?? "ACTIVE";
  const frequency = opts.frequency ?? "MONTHLY";
  await getPool().query(
    `INSERT INTO subscriptions (id, user_id, plan_type, status, frequency, stripe_subscription_id, created_at, updated_at)
     VALUES ($1, $2, 'MAJOR', $3, $4, $5, NOW(), NOW())`,
    [id, opts.userId, status, frequency, `sub_test_${id}`]
  );
  return id;
}

async function readFrequency(subId: string) {
  const { rows } = await getPool().query(
    "SELECT frequency FROM subscriptions WHERE id = $1",
    [subId]
  );
  return rows[0]?.frequency as "MONTHLY" | "QUARTERLY" | undefined;
}

test("switchSubscriptionFrequency flips MONTHLY → QUARTERLY on an ACTIVE sub", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `freq_${suffix}`,
    email: `freq-${suffix}@example.com`,
    firstName: "Freq",
    lastName: "Test",
  });
  assertClient(client);
  const subId = await createSubscription({ userId: client.id });

  const result = await switchSubscriptionFrequency(subId, client.id, "QUARTERLY");

  assert.equal(result.alreadySet, false);
  assert.equal(await readFrequency(subId), "QUARTERLY");
});

test("switchSubscriptionFrequency is idempotent when already at target", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `freq_${suffix}`,
    email: `freq-${suffix}@example.com`,
    firstName: "Freq",
    lastName: "Test",
  });
  assertClient(client);
  const subId = await createSubscription({
    userId: client.id,
    frequency: "QUARTERLY",
  });

  const result = await switchSubscriptionFrequency(subId, client.id, "QUARTERLY");

  assert.equal(result.alreadySet, true);
  assert.equal(await readFrequency(subId), "QUARTERLY");
});

test("switchSubscriptionFrequency rejects switch on CANCELLED subs", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `freq_${suffix}`,
    email: `freq-${suffix}@example.com`,
    firstName: "Freq",
    lastName: "Test",
  });
  assertClient(client);
  const subId = await createSubscription({
    userId: client.id,
    status: "CANCELLED",
  });

  await assert.rejects(
    () => switchSubscriptionFrequency(subId, client!.id, "QUARTERLY"),
    /active or trialing/
  );
});

test("switchSubscriptionFrequency rejects cross-user access", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `freq_${suffix}`,
    email: `freq-${suffix}@example.com`,
    firstName: "Freq",
    lastName: "Test",
  });
  assertClient(client);
  const subId = await createSubscription({ userId: client.id });

  await assert.rejects(
    () => switchSubscriptionFrequency(subId, "some-other-user", "QUARTERLY"),
    /not found/
  );
});
