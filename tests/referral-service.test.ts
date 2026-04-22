// Integration tests for src/lib/promotions/referral.service.ts. Covers the
// "first completion only" gate and the @unique(referredUserId) race guard.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  REFERRAL_CREDIT_IN_CENTS,
  claimCredit,
  getUnredeemedCreditBalance,
  issueReferralCreditIfFirstCompletion,
} from "@/lib/promotions/referral.service";
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

async function linkReferrer(referredUserId: string, referrerUserId: string) {
  await getPool().query(
    `UPDATE users SET referred_by_user_id = $2 WHERE id = $1`,
    [referredUserId, referrerUserId],
  );
}

async function createCompletedSession(clientId: string, stylistId: string) {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO sessions
      (id, client_id, stylist_id, plan_type, status, amount_paid_in_cents,
       moodboards_allowed, styleboards_allowed, created_at, updated_at, completed_at)
     VALUES ($1, $2, $3, 'MINI', 'COMPLETED', 6000, 1, 2, NOW(), NOW(), NOW())`,
    [id, clientId, stylistId],
  );
  return id;
}

test("issueReferralCreditIfFirstCompletion issues credit on first completion only", async () => {
  const suffix = randomUUID().slice(0, 8);
  const referrer = await ensureClientUser({
    clerkId: `rf_r_${suffix}`,
    email: `rf-r-${suffix}@example.com`,
    firstName: "Ref",
    lastName: "Errer",
  });
  const referred = await ensureClientUser({
    clerkId: `rf_d_${suffix}`,
    email: `rf-d-${suffix}@example.com`,
    firstName: "Ref",
    lastName: "Erred",
  });
  const stylist = await ensureStylistUser({
    clerkId: `rf_s_${suffix}`,
    email: `rf-s-${suffix}@example.com`,
    firstName: "Sty",
    lastName: "List",
  });
  teardown.push(referrer as User, referred as User, stylist as User);

  await linkReferrer(referred.id, referrer.id);

  // First completion fires the credit.
  const firstSession = await createCompletedSession(referred.id, stylist.id);
  const credit = await prisma.$transaction((tx) =>
    issueReferralCreditIfFirstCompletion(referred.id, firstSession, tx),
  );
  assert.ok(credit, "expected credit to be issued");
  assert.equal(credit?.referrerUserId, referrer.id);
  assert.equal(credit?.creditAmountInCents, REFERRAL_CREDIT_IN_CENTS);

  // Second completion is a no-op (count != 1) — but even if we force it,
  // the @unique(referredUserId) blocks a second insert.
  const secondSession = await createCompletedSession(referred.id, stylist.id);
  const second = await prisma.$transaction((tx) =>
    issueReferralCreditIfFirstCompletion(referred.id, secondSession, tx),
  );
  assert.equal(second, null, "second completion must not issue a second credit");

  const balance = await getUnredeemedCreditBalance(referrer.id);
  assert.equal(balance, REFERRAL_CREDIT_IN_CENTS);
});

test("issueReferralCreditIfFirstCompletion no-ops when user has no referrer", async () => {
  const suffix = randomUUID().slice(0, 8);
  const solo = await ensureClientUser({
    clerkId: `rf_solo_${suffix}`,
    email: `rf-solo-${suffix}@example.com`,
    firstName: "Solo",
    lastName: "Ist",
  });
  const stylist = await ensureStylistUser({
    clerkId: `rf_ss_${suffix}`,
    email: `rf-ss-${suffix}@example.com`,
    firstName: "Sty",
    lastName: "List",
  });
  teardown.push(solo as User, stylist as User);

  const sessionId = await createCompletedSession(solo.id, stylist.id);
  const credit = await prisma.$transaction((tx) =>
    issueReferralCreditIfFirstCompletion(solo.id, sessionId, tx),
  );
  assert.equal(credit, null);
});

test("claimCredit marks credits redeemed and limits to maxCents", async () => {
  const suffix = randomUUID().slice(0, 8);
  const referrer = await ensureClientUser({
    clerkId: `cl_r_${suffix}`,
    email: `cl-r-${suffix}@example.com`,
    firstName: "Cla",
    lastName: "Imer",
  });
  const r1 = await ensureClientUser({
    clerkId: `cl_a_${suffix}`,
    email: `cl-a-${suffix}@example.com`,
    firstName: "A",
    lastName: "A",
  });
  const r2 = await ensureClientUser({
    clerkId: `cl_b_${suffix}`,
    email: `cl-b-${suffix}@example.com`,
    firstName: "B",
    lastName: "B",
  });
  teardown.push(referrer as User, r1 as User, r2 as User);

  // Manually seed 2 credits (skips the completion gate for this test).
  await prisma.referralCredit.create({
    data: {
      referrerUserId: referrer.id,
      referredUserId: r1.id,
      creditAmountInCents: REFERRAL_CREDIT_IN_CENTS,
    },
  });
  await prisma.referralCredit.create({
    data: {
      referrerUserId: referrer.id,
      referredUserId: r2.id,
      creditAmountInCents: REFERRAL_CREDIT_IN_CENTS,
    },
  });

  // Claim up to $30 — should consume one $20 row and stop.
  const result = await prisma.$transaction((tx) =>
    claimCredit(referrer.id, 3000, tx),
  );
  assert.equal(result.claimedCents, REFERRAL_CREDIT_IN_CENTS);
  assert.equal(result.claimedIds.length, 1);

  const remaining = await getUnredeemedCreditBalance(referrer.id);
  assert.equal(remaining, REFERRAL_CREDIT_IN_CENTS);
});
