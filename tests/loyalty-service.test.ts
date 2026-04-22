// Unit + integration tests for src/lib/loyalty/service.ts. Tier boundaries
// are pure logic; recomputeForUser hits the DB to verify it denormalizes
// into both LoyaltyAccount and User.loyaltyTier atomically.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  recomputeForUser,
  tierForCompletedCount,
} from "@/lib/loyalty/service";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  ensureStylistUser,
  getPool,
} from "./e2e/db";

type User = { id: string; email: string };
const teardown: User[] = [];

afterEach(async () => {
  while (teardown.length > 0) {
    const u = teardown.pop();
    if (u) await cleanupE2EUserByEmail(u.email);
  }
});

test("tierForCompletedCount maps counts to tier boundaries", () => {
  assert.equal(tierForCompletedCount(0), "BRONZE");
  assert.equal(tierForCompletedCount(2), "BRONZE");
  assert.equal(tierForCompletedCount(3), "GOLD");
  assert.equal(tierForCompletedCount(7), "GOLD");
  assert.equal(tierForCompletedCount(8), "PLATINUM");
  assert.equal(tierForCompletedCount(100), "PLATINUM");
});

async function markSessionCompleted(sessionId: string) {
  await getPool().query(
    `UPDATE sessions SET status = 'COMPLETED', completed_at = NOW() WHERE id = $1`,
    [sessionId],
  );
}

async function createCompletedSession(clientId: string, stylistId: string) {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO sessions
      (id, client_id, stylist_id, plan_type, status, amount_paid_in_cents,
       moodboards_allowed, styleboards_allowed, created_at, updated_at)
     VALUES ($1, $2, $3, 'MINI', 'BOOKED', 6000, 1, 2, NOW(), NOW())`,
    [id, clientId, stylistId],
  );
  await markSessionCompleted(id);
  return id;
}

test("recomputeForUser writes both LoyaltyAccount and User.loyaltyTier", async () => {
  const suffix = randomUUID().slice(0, 8);
  const client = await ensureClientUser({
    clerkId: `loy_${suffix}`,
    email: `loy-${suffix}@example.com`,
    firstName: "Lo",
    lastName: "Yal",
  });
  const stylist = await ensureStylistUser({
    clerkId: `ly_s_${suffix}`,
    email: `ly-s-${suffix}@example.com`,
    firstName: "Sty",
    lastName: "List",
  });
  teardown.push(client as User, stylist as User);

  // Bronze after 0
  const a = await recomputeForUser(client.id);
  assert.equal(a.tier, "BRONZE");
  assert.equal(a.lifetimeBookingCount, 0);

  // Gold after 3
  for (let i = 0; i < 3; i++) await createCompletedSession(client.id, stylist.id);
  const b = await recomputeForUser(client.id);
  assert.equal(b.tier, "GOLD");
  assert.equal(b.lifetimeBookingCount, 3);

  // Platinum after 8
  for (let i = 0; i < 5; i++) await createCompletedSession(client.id, stylist.id);
  const c = await recomputeForUser(client.id);
  assert.equal(c.tier, "PLATINUM");
  assert.equal(c.lifetimeBookingCount, 8);

  // Both LoyaltyAccount + User.loyaltyTier reflect the latest tier
  const loyalty = await getPool().query(
    `SELECT tier, lifetime_booking_count FROM loyalty_accounts WHERE user_id = $1`,
    [client.id],
  );
  assert.equal(loyalty.rows[0].tier, "PLATINUM");
  assert.equal(loyalty.rows[0].lifetime_booking_count, 8);

  const user = await getPool().query(
    `SELECT loyalty_tier FROM users WHERE id = $1`,
    [client.id],
  );
  assert.equal(user.rows[0].loyalty_tier, "PLATINUM");
});
