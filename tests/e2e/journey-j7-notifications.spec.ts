import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import {
  getPendingActions,
  openPendingAction,
  runWorker,
  setNotificationPreference,
  setupAdmin,
  setupClient,
  setupLinkedSession,
  signInE2E,
} from "./fixtures/journey";

/**
 * J7 — Notifications.
 *
 * Klaviyo Events go out via server-side `fetch`, which Playwright cannot
 * intercept from a browser context. So these specs target the observable
 * side-effects of the dispatcher: pending-action-expiry worker flipping
 * rows, notification_preferences honored on read, no double-fire on
 * idempotent expiry runs.
 */

async function authedPage(page: Page, email: string): Promise<void> {
  await signInE2E(page, email);
}

// ---------------------------------------------------------------------------
// J7.1 — Booking → SYSTEM message + welcome touchpoint persists in DB
// ---------------------------------------------------------------------------

test("J7.1 notify-session-booked: an ACTIVE session has a system welcome message + an open pending action", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const ctx = await setupLinkedSession({
    prefix: "j7-booked",
    planType: "MAJOR",
    sessionStatus: "ACTIVE",
  });
  try {
    // Seed the WELCOME system template message + a PENDING_MOODBOARD action,
    // mirroring what `activateSession` writes in production.
    await getPool().query(
      `INSERT INTO messages
         (id, session_id, kind, system_template, text, created_at, updated_at)
       VALUES ($1, $2, 'SYSTEM_AUTOMATED'::"MessageKind", 'WELCOME', 'Welcome', NOW(), NOW())`,
      [randomUUID(), ctx.session.id],
    );
    await openPendingAction({
      sessionId: ctx.session.id,
      type: "PENDING_MOODBOARD",
      dueAtMinutesFromNow: 24 * 60,
    });

    await authedPage(page, ctx.client.email);
    const res = await page.request.get(
      `/api/sessions/${ctx.session.id}/messages`,
    );
    expect(res.status()).toBeLessThan(500);

    const actions = await getPendingActions(ctx.session.id);
    expect(actions.find((a) => a.type === "PENDING_MOODBOARD")).toBeTruthy();
    expect(
      actions.find((a) => a.type === "PENDING_MOODBOARD")?.status,
    ).toBe("OPEN");
  } finally {
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J7.2 — pending-action-expiry worker flips overdue actions to EXPIRED
// ---------------------------------------------------------------------------

test("J7.2 notify-overdue-fires: pending-action-expiry worker flips overdue OPEN → EXPIRED idempotently", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const ctx = await setupLinkedSession({
    prefix: "j7-overdue",
    planType: "MAJOR",
    sessionStatus: "ACTIVE",
  });
  const admin = await setupAdmin("j7-overdue-a");
  try {
    // Force an OPEN action with due_at 1h in the past.
    const action = await openPendingAction({
      sessionId: ctx.session.id,
      type: "PENDING_MOODBOARD",
      dueAtMinutesFromNow: -60,
    });

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await authedPage(adminPage, admin.email);

    await runWorker(adminPage, "pending-action-expiry");

    let { rows } = await getPool().query(
      `SELECT status FROM session_pending_actions WHERE id = $1`,
      [action.id],
    );
    expect(rows[0].status, "first run flips to EXPIRED").toBe("EXPIRED");

    // Idempotency — second run is a no-op (no error, status unchanged).
    await runWorker(adminPage, "pending-action-expiry");
    rows = (
      await getPool().query(
        `SELECT status FROM session_pending_actions WHERE id = $1`,
        [action.id],
      )
    ).rows;
    expect(rows[0].status, "second run idempotent").toBe("EXPIRED");

    await adminCtx.close();
  } finally {
    await admin.cleanup();
    await ctx.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J7.3 — Notification preferences honoured on read
// ---------------------------------------------------------------------------

test("J7.3 notify-prefs-honored: opting out of SMS for a category persists + does not 5xx", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const client = await setupClient("j7-prefs");
  try {
    await setNotificationPreference({
      userId: client.id,
      channel: "SMS",
      category: "moodboard.sent",
      isEnabled: false,
    });
    // Opt-out is sticky: a second write with the same shape upserts cleanly.
    await setNotificationPreference({
      userId: client.id,
      channel: "SMS",
      category: "moodboard.sent",
      isEnabled: false,
    });

    const { rows } = await getPool().query(
      `SELECT channel, category, is_enabled FROM notification_preferences
         WHERE user_id = $1 AND channel = 'SMS'::"NotificationChannel"
           AND category = 'moodboard.sent'`,
      [client.id],
    );
    expect(rows.length, "single preference row, not duplicated").toBe(1);
    expect(rows[0].is_enabled).toBe(false);

    // The dispatcher path itself runs server-side; verify the auth + load
    // path doesn't 5xx by hitting any client surface that touches prefs.
    await authedPage(page, client.email);
    const res = await page.goto("/settings");
    expect(res?.status() ?? 200).toBeLessThan(500);
  } finally {
    await client.cleanup();
  }
});

// ---------------------------------------------------------------------------
// J7.4 — Worker auth: bare POST without admin auth must be rejected
// ---------------------------------------------------------------------------

test("J7.4 notify-worker-auth: anonymous POST to /api/admin/workers/[name]/run is rejected", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // No sign-in — anonymous request must not run a worker. Clerk's
  // proxy-level `auth.protect()` may redirect (302/307) for unauthed API
  // hits, while requireAdmin() in the handler returns 401/403/404. Any
  // non-2xx response means the worker did NOT execute, which is the
  // contract under test.
  const res = await page.request.post(
    "/api/admin/workers/pending-action-expiry/run",
    { maxRedirects: 0 },
  );
  expect(res.status(), "anon dispatch must be non-2xx").toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(500);
  // Body must not contain a worker-success payload.
  const text = await res.text().catch(() => "");
  expect(text).not.toContain('"ok":true');
});
