// Integration test for src/lib/stylists/review.service.ts. Verifies the
// eligibility gate, the StylistReview + Session.reviewText aggregation,
// and the averageRating recompute that runs in the create-review tx.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import {
  canUserReviewStylist,
  createStylistReview,
  listStylistReviews,
  recomputeAverageRating,
} from "@/lib/stylists/review.service";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function setupTrio() {
  const suffix = randomUUID().slice(0, 8);
  const clientEmail = `rev-client-${suffix}@example.com`;
  const otherEmail = `rev-other-${suffix}@example.com`;
  const stylistEmail = `rev-stylist-${suffix}@example.com`;

  const client = await ensureClientUser({
    clerkId: `rev-client-${suffix}`,
    email: clientEmail,
    firstName: "Rev",
    lastName: "Client",
  });
  const other = await ensureClientUser({
    clerkId: `rev-other-${suffix}`,
    email: otherEmail,
    firstName: "Other",
    lastName: "Reviewer",
  });
  const stylistUser = await ensureStylistUser({
    clerkId: `rev-stylist-${suffix}`,
    email: stylistEmail,
    firstName: "Rev",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylistUser.id });

  cleanups.push(async () => {
    await cleanupStylistProfile(stylistUser.id);
    await cleanupE2EUserByEmail(stylistEmail);
    await cleanupE2EUserByEmail(otherEmail);
    await cleanupE2EUserByEmail(clientEmail);
  });

  return { client, other, stylistUser, profile };
}

async function completeSessionWithRating(opts: {
  clientId: string;
  stylistUserId: string;
  rating: number;
  reviewText: string | null;
}) {
  const session = await createSessionForClient({
    clientId: opts.clientId,
    stylistId: opts.stylistUserId,
    status: "COMPLETED",
  });
  await getPool().query(
    `UPDATE sessions SET rating = $1, review_text = $2, rated_at = NOW(), completed_at = NOW() WHERE id = $3`,
    [opts.rating, opts.reviewText, session.id],
  );
  return session;
}

test("canUserReviewStylist returns false with zero COMPLETED sessions", async () => {
  const { client, profile } = await setupTrio();
  assert.equal(await canUserReviewStylist(client.id, profile.id), false);
});

test("canUserReviewStylist returns true after a COMPLETED session", async () => {
  const { client, profile, stylistUser } = await setupTrio();
  await completeSessionWithRating({
    clientId: client.id,
    stylistUserId: stylistUser.id,
    rating: 5,
    reviewText: null,
  });
  assert.equal(await canUserReviewStylist(client.id, profile.id), true);
});

test("createStylistReview throws without a COMPLETED session", async () => {
  const { client, profile } = await setupTrio();
  await assert.rejects(
    createStylistReview({
      userId: client.id,
      stylistProfileId: profile.id,
      rating: 5,
      reviewText: "great!",
    }),
    /completed a session/i,
  );
});

test("createStylistReview persists + recomputes averageRating", async () => {
  const { client, profile, stylistUser } = await setupTrio();
  await completeSessionWithRating({
    clientId: client.id,
    stylistUserId: stylistUser.id,
    rating: 5,
    reviewText: null,
  });

  const review = await createStylistReview({
    userId: client.id,
    stylistProfileId: profile.id,
    rating: 4,
    reviewText: "really enjoyed it",
  });
  assert.equal(review.rating, 4);
  assert.equal(review.reviewText, "really enjoyed it");

  const { rows } = await getPool().query(
    `SELECT average_rating FROM stylist_profiles WHERE id = $1`,
    [profile.id],
  );
  // Explicit (4) overrides the session rating (5) for the same user, so
  // the average over {client → 4} is 4.
  assert.equal(Number(rows[0].average_rating), 4);
});

test("listStylistReviews aggregates explicit + session, de-duped per user", async () => {
  const { client, other, profile, stylistUser } = await setupTrio();
  // client has both a session rating AND an explicit review; the explicit
  // one should win and the session entry shouldn't appear.
  await completeSessionWithRating({
    clientId: client.id,
    stylistUserId: stylistUser.id,
    rating: 3,
    reviewText: "session rating",
  });
  await createStylistReview({
    userId: client.id,
    stylistProfileId: profile.id,
    rating: 5,
    reviewText: "explicit override",
  });

  // other has only a session rating — it should appear.
  await completeSessionWithRating({
    clientId: other.id,
    stylistUserId: stylistUser.id,
    rating: 4,
    reviewText: "loved the looks",
  });

  const { reviews, total } = await listStylistReviews(profile.id);
  assert.equal(total, 2);
  assert.equal(reviews.length, 2);

  const explicit = reviews.find((r) => r.source === "REVIEW");
  const sessionOnly = reviews.find((r) => r.source === "SESSION");
  assert.ok(explicit);
  assert.ok(sessionOnly);
  assert.equal(explicit.reviewText, "explicit override");
  assert.equal(sessionOnly.reviewText, "loved the looks");

  // Author surface uses first name + last initial.
  assert.equal(explicit.author.firstName, "Rev");
  assert.equal(explicit.author.lastNameInitial, "C");
  assert.equal(sessionOnly.author.firstName, "Other");
  assert.equal(sessionOnly.author.lastNameInitial, "R");
});

test("listStylistReviews paginates by limit + offset", async () => {
  const { profile, stylistUser } = await setupTrio();
  // Seed 5 distinct clients each with a session rating.
  for (let i = 0; i < 5; i++) {
    const suffix = randomUUID().slice(0, 8);
    const email = `rev-bulk-${suffix}@example.com`;
    const c = await ensureClientUser({
      clerkId: `rev-bulk-${suffix}`,
      email,
      firstName: `B${i}`,
      lastName: `User${i}`,
    });
    cleanups.push(async () => {
      await cleanupE2EUserByEmail(email);
    });
    await completeSessionWithRating({
      clientId: c.id,
      stylistUserId: stylistUser.id,
      rating: 5,
      reviewText: `review ${i}`,
    });
  }

  const page1 = await listStylistReviews(profile.id, { limit: 2, offset: 0 });
  const page2 = await listStylistReviews(profile.id, { limit: 2, offset: 2 });
  assert.equal(page1.total, 5);
  assert.equal(page1.reviews.length, 2);
  assert.equal(page2.reviews.length, 2);
  // No overlap between pages.
  const overlap = page1.reviews.some((a) =>
    page2.reviews.some((b) => b.id === a.id),
  );
  assert.equal(overlap, false);
});

test("recomputeAverageRating uses dedup math (explicit overrides session)", async () => {
  const { client, other, profile, stylistUser } = await setupTrio();
  // client: session=2, explicit=5 → contributes 5
  // other: session=3 only → contributes 3
  // expected average = 4
  await completeSessionWithRating({
    clientId: client.id,
    stylistUserId: stylistUser.id,
    rating: 2,
    reviewText: null,
  });
  await createStylistReview({
    userId: client.id,
    stylistProfileId: profile.id,
    rating: 5,
    reviewText: "five stars from me",
  });
  await completeSessionWithRating({
    clientId: other.id,
    stylistUserId: stylistUser.id,
    rating: 3,
    reviewText: null,
  });

  const avg = await recomputeAverageRating(profile.id);
  assert.equal(avg, 4);
});
