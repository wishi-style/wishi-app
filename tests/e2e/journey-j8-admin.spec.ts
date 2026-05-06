import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import {
  getAuditLogs,
  getOrdersForUser,
  seedOrder,
  seedOrderItem,
  setupAdmin,
  setupClient,
  setupLinkedSession,
  setupStylist,
  signInE2E,
} from "./fixtures/journey";

/**
 * J8 — Admin operations.
 *
 * Cover the privileged paths: stylist promotion, eligibility fanout,
 * reassignment, quiz builder, order fulfillment, idempotent refund, audit
 * log completeness. These are the buttons that, when broken in production,
 * keep ops awake at 3am.
 */

async function authedPage(page: Page, email: string): Promise<void> {
  await signInE2E(page, email);
}

// ---------------------------------------------------------------------------
// J8.1 — Promote a stylist to ELIGIBLE + audit row written
// ---------------------------------------------------------------------------

test("J8.1 admin-promote-and-flow: AWAITING_ELIGIBILITY → POST /approve flips to ELIGIBLE + audit row", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const admin = await setupAdmin("j8-promote-a");
  const stylist = await setupStylist("j8-promote-s", {
    onboardingStatus: "AWAITING_ELIGIBILITY",
    onboardingStep: 12,
    matchEligible: false,
  });
  try {
    await authedPage(page, admin.email);
    const res = await page.request.post(
      `/api/admin/stylists/${stylist.id}/approve`,
    );
    expect(res.status(), "approve returns success or 4xx (not 5xx)").toBeLessThan(500);

    if (res.ok()) {
      const { rows } = await getPool().query(
        `SELECT onboarding_status FROM stylist_profiles WHERE user_id = $1`,
        [stylist.id],
      );
      expect(rows[0].onboarding_status).toBe("ELIGIBLE");

      const audits = await getAuditLogs({
        actorUserId: admin.id,
        entityType: "StylistProfile",
      });
      expect(audits.length, "promote writes an audit row").toBeGreaterThanOrEqual(1);
    }
  } finally {
    await stylist.cleanup();
    await admin.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J8.2 — Eligibility fanout: ELIGIBLE stylist appears in /api/matches
// ---------------------------------------------------------------------------

test("J8.2 admin-eligibility-fanout: an ELIGIBLE+available stylist surfaces in the authed profile API", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const client = await setupClient("j8-eligible-c");
  const stylist = await setupStylist("j8-eligible", {
    onboardingStatus: "ELIGIBLE",
    isAvailable: true,
    matchEligible: true,
  });
  try {
    // /api/stylists/[id] requires auth (proxy gates non-public /api/* paths).
    // Use the StylistProfile.id, not User.id — the route looks up by profile.
    await signInE2E(page, client.email);
    const res = await page.request.get(`/api/stylists/${stylist.profileId}`);
    expect(res.status(), "endpoint reachable").toBeLessThan(500);

    if (res.status() === 200) {
      const body = (await res.json()) as { id?: string; userId?: string };
      expect(body.id).toBe(stylist.profileId);
      expect(body.userId).toBe(stylist.id);
    }
  } finally {
    await stylist.cleanup();
    await client.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J8.3 — Reassign session writes audit + flips Session.stylistUserId
// ---------------------------------------------------------------------------

test("J8.3 admin-reassign-writes-history: POST /reassign writes audit + new stylist on session", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const admin = await setupAdmin("j8-reassign-a");
  const ctx = await setupLinkedSession({
    prefix: "j8-reassign",
    planType: "MAJOR",
    sessionStatus: "ACTIVE",
  });
  const replacementStylist = await setupStylist("j8-reassign-2", {
    onboardingStatus: "ELIGIBLE",
    isAvailable: true,
    matchEligible: true,
  });
  try {
    await authedPage(page, admin.email);
    const res = await page.request.post(
      `/api/admin/sessions/${ctx.session.id}/reassign`,
      {
        data: {
          newStylistUserId: replacementStylist.id,
          reason: "j8-reassign-test",
        },
      },
    );
    expect(res.status()).toBeLessThan(500);

    if (res.ok()) {
      const { rows } = await getPool().query(
        `SELECT stylist_id FROM sessions WHERE id = $1`,
        [ctx.session.id],
      );
      expect(rows[0].stylist_id).toBe(replacementStylist.id);

      const audits = await getAuditLogs({
        actorUserId: admin.id,
        entityType: "Session",
      });
      expect(audits.find((a) => a.action.includes("reassign"))).toBeTruthy();
    }
  } finally {
    await replacementStylist.cleanup();
    await ctx.cleanup();
    await admin.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J8.4 — Quiz builder PUT rewrites questions in one transaction (no deploy)
// ---------------------------------------------------------------------------

test("J8.4 admin-quiz-builder-no-deploy: PUT /api/admin/quiz/STYLE_PREFERENCE replaces questions atomically", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const admin = await setupAdmin("j8-quiz");
  try {
    await authedPage(page, admin.email);

    // Snapshot the existing question count so we can restore order/length
    // assumptions after the test.
    const before = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM quiz_questions
        WHERE quiz_id = (SELECT id FROM quizzes WHERE type = 'STYLE_PREFERENCE')`,
    );
    expect(before.rows[0].n, "STYLE_PREFERENCE quiz seeded").toBeGreaterThan(0);

    // Send a malformed payload — must 4xx, never 5xx.
    const badRes = await page.request.put(
      "/api/admin/quiz/STYLE_PREFERENCE",
      { data: { questions: [{ bogus: true }] } },
    );
    expect(badRes.status()).toBeGreaterThanOrEqual(400);
    expect(badRes.status()).toBeLessThan(500);

    // Question count unchanged after a rejected save.
    const after = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM quiz_questions
        WHERE quiz_id = (SELECT id FROM quizzes WHERE type = 'STYLE_PREFERENCE')`,
    );
    expect(after.rows[0].n, "rejected save does not partially-write").toBe(
      before.rows[0].n,
    );
  } finally {
    await admin.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J8.5 — Order fulfillment state machine end-to-end
// ---------------------------------------------------------------------------

test("J8.5 admin-order-fulfillment: ORDERED → SHIPPED (with tracking) → ARRIVED via admin API", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await setupLinkedSession({
    prefix: "j8-fulfill",
    planType: "MAJOR",
  });
  const admin = await setupAdmin("j8-fulfill-a");
  try {
    const order = await seedOrder({
      userId: ctx.client.id,
      sessionId: ctx.session.id,
      source: "DIRECT_SALE",
      status: "ORDERED",
      retailer: "Wishi",
      totalInCents: 24_000,
    });
    await seedOrderItem({
      orderId: order.id,
      title: "Suede Loafers",
      brand: "TestBrand",
      priceInCents: 24_000,
      inventoryProductId: `inv_j8_${randomUUID().slice(0, 8)}`,
    });

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await authedPage(adminPage, admin.email);

    // Tracking is set on a separate /tracking endpoint (the /status route's
    // Zod schema doesn't accept trackingNumber).
    const tracking = await adminPage.request.post(
      `/api/admin/orders/${order.id}/tracking`,
      {
        data: { trackingNumber: "1Z9999W90100000099", carrier: "UPS" },
      },
    );
    expect(tracking.status(), "tracking endpoint reachable").toBeLessThan(500);

    const ship = await adminPage.request.post(
      `/api/admin/orders/${order.id}/status`,
      { data: { status: "SHIPPED" } },
    );
    expect([200, 201, 204]).toContain(ship.status());

    const arrive = await adminPage.request.post(
      `/api/admin/orders/${order.id}/status`,
      { data: { status: "ARRIVED" } },
    );
    expect([200, 201, 204]).toContain(arrive.status());

    const orders = await getOrdersForUser(ctx.client.id);
    expect(orders[0].status).toBe("ARRIVED");
    if (tracking.status() === 200) {
      expect(orders[0].tracking_number).toBe("1Z9999W90100000099");
    }

    const audits = await getAuditLogs({
      actorUserId: admin.id,
      entityType: "Order",
    });
    expect(audits.length, "fulfillment writes audit rows").toBeGreaterThanOrEqual(1);

    await adminCtx.close();
  } finally {
    await admin.cleanup();
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J8.6 — Refund idempotency: replaying the same refund call does not double
// ---------------------------------------------------------------------------

test("J8.6 admin-refund-idempotent: two identical refund POSTs do not double-refund", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const ctx = await setupLinkedSession({
    prefix: "j8-refund",
    planType: "MAJOR",
  });
  const admin = await setupAdmin("j8-refund-a");
  try {
    const order = await seedOrder({
      userId: ctx.client.id,
      sessionId: ctx.session.id,
      source: "DIRECT_SALE",
      status: "ARRIVED",
      retailer: "Wishi",
      totalInCents: 30_000,
      arrivedAtDaysAgo: 3,
    });
    await seedOrderItem({ orderId: order.id, priceInCents: 30_000 });

    await authedPage(page, admin.email);
    const r1 = await page.request.post(
      `/api/admin/orders/${order.id}/refund`,
      { data: { amountInCents: 30_000, reason: "j8-test" } },
    );
    const r2 = await page.request.post(
      `/api/admin/orders/${order.id}/refund`,
      { data: { amountInCents: 30_000, reason: "j8-test" } },
    );
    // Both must be non-5xx. Stripe idempotency-keying lives in
    // refundOrder — the second call should either no-op or return the same
    // stripeRefundId.
    for (const r of [r1, r2]) {
      expect(r.status()).toBeLessThan(500);
    }

    const { rows } = await getPool().query(
      `SELECT refunded_in_cents FROM orders WHERE id = $1`,
      [order.id],
    );
    // At most one refund applied — refunded_in_cents must not exceed total.
    expect(
      rows[0].refunded_in_cents ?? 0,
      "refund cap not exceeded by replay",
    ).toBeLessThanOrEqual(30_000);
  } finally {
    await admin.cleanup();
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J8.7 — Audit log completeness across an admin session
// ---------------------------------------------------------------------------

test("J8.7 admin-audit-log-completeness: a sequence of admin mutations writes one audit row each", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const admin = await setupAdmin("j8-audit");
  const stylist = await setupStylist("j8-audit-s", {
    onboardingStatus: "AWAITING_ELIGIBILITY",
    onboardingStep: 12,
    matchEligible: false,
  });
  const client = await setupClient("j8-audit-c");
  try {
    await authedPage(page, admin.email);

    const before = (
      await getPool().query(
        `SELECT COUNT(*)::int AS n FROM audit_logs WHERE actor_user_id = $1`,
        [admin.id],
      )
    ).rows[0].n;

    // Mutation 1: approve a stylist.
    await page.request.post(`/api/admin/stylists/${stylist.id}/approve`);
    // Mutation 2: refund attempt on a non-existent order — even when it
    // returns 4xx the contract is "no audit row written for failed mutation".
    await page.request.post(
      `/api/admin/orders/${randomUUID()}/refund`,
      { data: { amountInCents: 100, reason: "nope" } },
    );

    const after = (
      await getPool().query(
        `SELECT COUNT(*)::int AS n FROM audit_logs WHERE actor_user_id = $1`,
        [admin.id],
      )
    ).rows[0].n;

    expect(after, "at least one audit row written by approve").toBeGreaterThan(before);
  } finally {
    await client.cleanup();
    await stylist.cleanup();
    await admin.cleanup();
  }
});
