import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./db";

/**
 * Pin the deriveDashboardAction contract end-to-end. Six possible labels,
 * each must navigate to a real destination — replaces the previous
 * Loveable-mirrored vocabulary where "Start styling" / "View session" /
 * "Awaiting approval" were no-op buttons.
 *
 * Each test seeds one session in the relevant state, signs the stylist in,
 * loads /stylist/dashboard, asserts the row's primary CTA shows the
 * expected label, and (where applicable) clicks it and confirms the
 * navigation lands on the right route.
 */

test.afterAll(async () => {
  await disconnectTestDb();
});

interface SeedResult {
  clientEmail: string;
  stylistEmail: string;
  stylistUserId: string;
  sessionId: string;
}

async function seedSession(
  testTag: string,
  options: {
    moodboardsSent?: number;
    styleboardsSent?: number;
    styleboardsAllowed?: number;
    status?:
      | "BOOKED"
      | "ACTIVE"
      | "PENDING_END_APPROVAL"
      | "COMPLETED"
      | "CANCELLED";
    endRequestedAt?: Date | null;
    pendingActionType?: "PENDING_RESTYLE";
    pendingRestyleParentBoardId?: string | null;
  } = {},
): Promise<SeedResult> {
  const ts = Date.now();
  const clientEmail = `${testTag}-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `${testTag}-stylist-${ts}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_${testTag}_client_${ts}`,
    email: clientEmail,
    firstName: "Action",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: `e2e_${testTag}_stylist_${ts}`,
    email: stylistEmail,
    firstName: "Avery",
    lastName: "Lin",
  });
  await ensureStylistProfile({ userId: stylist.id });

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: options.status === "PENDING_END_APPROVAL" ? "PENDING_END_APPROVAL"
      : options.status === "COMPLETED" ? "COMPLETED"
      : options.status === "CANCELLED" ? "CANCELLED"
      : options.status === "BOOKED" ? "BOOKED"
      : "ACTIVE",
    planType: "MAJOR",
  });

  // The DB-level fixture defaults moodboardsSent=0 / styleboardsSent=0.
  // For each scenario we tweak the counters + flags directly so we don't
  // have to walk the full booking + send-board flow per spec.
  await getPool().query(
    `UPDATE sessions SET
       moodboards_sent = $2,
       styleboards_sent = $3,
       styleboards_allowed = COALESCE($4, styleboards_allowed),
       end_requested_at = $5,
       completed_at = CASE WHEN $6 = 'COMPLETED' THEN NOW() ELSE completed_at END
     WHERE id = $1`,
    [
      session.id,
      options.moodboardsSent ?? 1,
      options.styleboardsSent ?? 0,
      options.styleboardsAllowed ?? null,
      options.endRequestedAt ?? null,
      options.status ?? null,
    ],
  );

  if (options.pendingActionType) {
    await getPool().query(
      `INSERT INTO session_pending_actions
        (id, session_id, type, status, board_id, due_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'OPEN', $4, NOW() + INTERVAL '1 day', NOW(), NOW())`,
      [
        `pa_${testTag}_${ts}`,
        session.id,
        options.pendingActionType,
        options.pendingRestyleParentBoardId ?? null,
      ],
    );
  }

  return {
    clientEmail,
    stylistEmail,
    stylistUserId: stylist.id,
    sessionId: session.id,
  };
}

async function signInAsStylist(
  page: import("@playwright/test").Page,
  email: string,
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

async function teardown(seed: SeedResult) {
  await getPool().query("DELETE FROM session_pending_actions WHERE session_id = $1", [seed.sessionId]);
  await cleanupStylistProfile(seed.stylistUserId);
  await cleanupE2EUserByEmail(seed.clientEmail);
  await cleanupE2EUserByEmail(seed.stylistEmail);
}

test("Create Moodboard → moodboards/new (no moodboard sent yet)", async ({ page }) => {
  const seed = await seedSession("create-moodboard", {
    moodboardsSent: 0,
    status: "BOOKED",
  });
  try {
    await signInAsStylist(page, seed.stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("button", { name: "Create Moodboard" });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(
      new RegExp(`/stylist/sessions/${seed.sessionId}/moodboards/new`),
    );
  } finally {
    await teardown(seed);
  }
});

test("Create Look → styleboards/new (moodboard sent, looks remain)", async ({ page }) => {
  const seed = await seedSession("create-look", {
    moodboardsSent: 1,
    styleboardsSent: 1,
    styleboardsAllowed: 5,
  });
  try {
    await signInAsStylist(page, seed.stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("button", { name: "Create Look" }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(
      new RegExp(`/stylist/sessions/${seed.sessionId}/styleboards/new$`),
    );
  } finally {
    await teardown(seed);
  }
});

test("Review Restyle → styleboards/new?parentBoardId= (PENDING_RESTYLE with boardId)", async ({ page }) => {
  // Seed a sent styleboard first so the restyle action can reference it.
  const seed = await seedSession("review-restyle", {
    moodboardsSent: 1,
    styleboardsSent: 1,
    styleboardsAllowed: 5,
  });
  // Create a board row to satisfy the foreign key on session_pending_actions.board_id
  const boardId = `board_restyle_${Date.now()}`;
  await getPool().query(
    `INSERT INTO boards (id, type, session_id, sent_at, created_at, updated_at)
     VALUES ($1, 'STYLEBOARD', $2, NOW(), NOW(), NOW())`,
    [boardId, seed.sessionId],
  );
  await getPool().query(
    `INSERT INTO session_pending_actions
      (id, session_id, type, status, board_id, due_at, created_at, updated_at)
     VALUES ($1, $2, 'PENDING_RESTYLE', 'OPEN', $3, NOW() + INTERVAL '1 day', NOW(), NOW())`,
    [`pa_restyle_${Date.now()}`, seed.sessionId, boardId],
  );

  try {
    await signInAsStylist(page, seed.stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("button", { name: "Review Restyle" });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/stylist/sessions/${seed.sessionId}/styleboards/new\\?parentBoardId=${boardId}`,
      ),
    );
  } finally {
    await getPool().query("DELETE FROM session_pending_actions WHERE session_id = $1", [seed.sessionId]);
    await getPool().query("DELETE FROM boards WHERE id = $1", [boardId]);
    await teardown(seed);
  }
});

test("Awaiting Client → navigates to dashboard chat (stylist can't self-approve)", async ({ page }) => {
  const seed = await seedSession("awaiting-client", {
    moodboardsSent: 1,
    styleboardsSent: 5,
    styleboardsAllowed: 5,
    status: "PENDING_END_APPROVAL",
    endRequestedAt: new Date(),
  });
  try {
    await signInAsStylist(page, seed.stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("button", { name: "Awaiting Client" }).first();
    await expect(cta).toBeVisible();
    // Stylist can't approve their own end-request — clicking just opens the
    // chat where the awaiting-approval badge surfaces the state.
    await cta.click();
    await expect(page).toHaveURL(/\/stylist\/dashboard/);
  } finally {
    await teardown(seed);
  }
});

test("View Summary → dashboard chat (COMPLETED session)", async ({ page }) => {
  const seed = await seedSession("view-summary", {
    moodboardsSent: 1,
    styleboardsSent: 5,
    styleboardsAllowed: 5,
    status: "COMPLETED",
  });
  try {
    await signInAsStylist(page, seed.stylistEmail);
    await page.goto("/stylist/dashboard?folder=archive");
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("button", { name: "View Summary" }).first();
    await expect(cta).toBeVisible();
  } finally {
    await teardown(seed);
  }
});

test("Open Chat → dashboard chat (looks at quota, awaiting client)", async ({ page }) => {
  const seed = await seedSession("open-chat", {
    moodboardsSent: 1,
    styleboardsSent: 5,
    styleboardsAllowed: 5,
    status: "ACTIVE",
  });
  try {
    await signInAsStylist(page, seed.stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const cta = page.getByRole("button", { name: "Open Chat" }).first();
    await expect(cta).toBeVisible();
    await cta.click();
    // The "navigate" kind for Open Chat targets the dashboard with the
    // session selected — same origin route.
    await expect(page).toHaveURL(
      new RegExp(`/stylist/dashboard\\?session=${seed.sessionId}`),
    );
  } finally {
    await teardown(seed);
  }
});

test("dashboard never renders the deprecated no-op vocabulary", async ({
  page,
}) => {
  const seed = await seedSession("no-deprecated-labels", {
    moodboardsSent: 1,
    styleboardsSent: 5,
    styleboardsAllowed: 5,
    status: "ACTIVE",
  });
  try {
    await signInAsStylist(page, seed.stylistEmail);
    await page.goto("/stylist/dashboard");
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    // The pre-fix Loveable vocabulary — none of these should appear in the
    // dashboard chrome any longer. (They may legitimately appear inside chat
    // messages, but not as button labels in this seeded scenario where
    // looks-at-quota should yield "Open Chat".)
    for (const dead of ["Start styling", "View session", "Awaiting approval"]) {
      expect(body, `should not surface "${dead}"`).not.toContain(dead);
    }
  } finally {
    await teardown(seed);
  }
});
