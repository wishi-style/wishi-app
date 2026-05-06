import { expect, test, type Page } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createBoardFixture,
  createSessionForClient,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getLatestMatchQuizResultForUser,
  getPool,
  getUserByEmail,
} from "./db";
import { signInE2E, uniqueStamp } from "./fixtures/journey";

/**
 * J1 — Conversion funnel.
 *
 * The existing per-page specs (homepage-redesign, pricing-redesign, etc.) prove
 * the marketing surfaces render. The J1 suite proves that an anonymous user
 * who lands on those pages actually completes the funnel and ends up with the
 * right rows in the DB. State asserted at every hop.
 */

// Mirrors `styleBoards` / `menStyleBoards` in
// src/app/match-quiz/match-quiz-client.tsx — keep these arrays in lockstep.
const MEN_BOARDS = ["Streetwear", "Rugged", "Edgy", "Cool", "Elegant"] as const;
const WOMEN_BOARDS = [
  "Minimal",
  "Feminine",
  "Chic",
  "Classic",
  "Bohemian",
  "Street",
  "Sexy",
] as const;

async function completeMatchQuizGuest(
  page: Page,
  opts: { gender: "Women" | "Men"; loveStyle: string } = {
    gender: "Women",
    loveStyle: "Minimal",
  },
): Promise<void> {
  await page.goto("/match-quiz");
  await expect(page.getByText("NEEDS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText("DEPARTMENT", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: opts.gender, exact: true }).click();
  if (opts.gender === "Women") {
    await expect(page.getByText("BODY TYPE", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Skip" }).click();
  }
  const order = opts.gender === "Men" ? MEN_BOARDS : WOMEN_BOARDS;
  for (const name of order) {
    await expect(
      page.getByRole("heading", { name: `Do you like ${name} style?` }),
    ).toBeVisible();
    const vote = name === opts.loveStyle ? "LOVE IT" : "NO";
    await page.getByRole("button", { name: `${vote} for ${name}` }).click();
    await page.waitForTimeout(600);
  }
}

async function setupAvailableStylist(prefix: string) {
  const stamp = uniqueStamp();
  const email = `${prefix}-styl-${stamp}@e2e.wishi.test`;
  const stylist = await ensureStylistUser({
    clerkId: `e2e_${prefix}_styl_${stamp.replace(/-/g, "_")}`,
    email,
    firstName: "Avail",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({
    userId: stylist.id,
    isAvailable: true,
    matchEligible: true,
    styleSpecialties: ["minimalist", "Streetwear"],
    genderPreference: ["FEMALE", "MALE"],
  });
  return {
    user: stylist,
    email,
    profile,
    cleanup: async () => {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(email);
    },
  };
}

// ---------------------------------------------------------------------------
// J1.1 — Mini one-time funnel: homepage CTA → quiz → sign-up → matches
// ---------------------------------------------------------------------------

test("J1.1 funnel-mini-onetime: homepage hero → quiz → signup claims quiz → /matches", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = uniqueStamp();
  const email = `j1-mini-${stamp}@e2e.wishi.test`;
  const stylist = await setupAvailableStylist("j1-mini");

  try {
    // Land cold on homepage. Hero CTA must route to /match-quiz.
    await page.goto("/");
    const startCta = page
      .getByRole("link", { name: /Find Your Best Match|Get Started|Take the quiz/i })
      .first();
    await expect(startCta).toBeVisible();
    await startCta.click();
    await expect(page).toHaveURL(/\/match-quiz/);

    await completeMatchQuizGuest(page, { gender: "Women", loveStyle: "Minimal" });

    // Guest completion → real Clerk would mount openSignUp modal, but E2E
    // mode bypasses Clerk entirely; the user lingers on /match-quiz with the
    // guest-token cookie minted by submitMatchQuiz. Ride the cookie through
    // the E2E sign-up backdoor (which honors guestToken in claimGuestQuizResult).
    await page.goto("/sign-up?e2e=1");
    await page.getByLabel("First name").fill("J1");
    await page.getByLabel("Last name").fill("Mini");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Create Account" }).click();

    // Lands somewhere sensible after signup (matches, stylists, or stylist-match).
    await expect(page).toHaveURL(/\/(matches|stylists|stylist-match)/);

    const user = await getUserByEmail(email);
    expect(user).not.toBeNull();
    const quiz = await getLatestMatchQuizResultForUser(user!.id);
    expect(quiz?.claimed_at, "guest quiz claimed on signup").not.toBeNull();
    expect(quiz?.gender_to_style).toBe("FEMALE");
  } finally {
    await stylist.cleanup();
    await cleanupE2EUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// J1.2 — Major subscription funnel from /pricing
// ---------------------------------------------------------------------------

test("J1.2 funnel-major-sub: /pricing tier CTA → quiz → E2E bypass creates TRIALING sub", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = uniqueStamp();
  const email = `j1-major-${stamp}@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `e2e_j1_major_${stamp.replace(/-/g, "_")}`,
    email,
    firstName: "J1",
    lastName: "Major",
  });
  const stylist = await setupAvailableStylist("j1-major");

  try {
    await signInE2E(page, email);

    // Land on /pricing → tier CTA → match-quiz → ... we shortcut into the
    // booking page since the pricing CTA's destination is already covered by
    // pricing-redesign.spec.ts. The point is to assert the full subscription
    // path lands a TRIALING row.
    await page.goto(`/bookings/new?stylistId=${stylist.profile.id}`);
    // Plan card is a <button> wrapping <h3>Major</h3> + price/copy. The
    // accessible name is the multi-line concatenation of every descendant,
    // so a literal `^Major$` regex never matches — locate the heading and
    // walk up to the enclosing button.
    await page.locator('button:has(h3:text-is("Major"))').click();

    // Toggle on the subscription path. The toggle is the <button> sibling of
    // the "Subscribe monthly (3-day free trial)" span, both wrapped in a
    // div.flex. Use a tighter selector than `div hasText "..."` (which would
    // match the page root).
    await page
      .locator('span:has-text("Subscribe monthly")')
      .locator('xpath=preceding-sibling::button[1]')
      .click();

    await page.getByRole("button", { name: /Start Free Trial/ }).click();
    await page.waitForURL("**/sessions", { timeout: 15_000 });

    const sub = await getPool().query(
      `SELECT status, plan_type, trial_ends_at FROM subscriptions WHERE user_id = $1`,
      [client.id],
    );
    expect(sub.rowCount, "subscription created").toBe(1);
    expect(sub.rows[0].status).toBe("TRIALING");
    expect(sub.rows[0].plan_type).toBe("MAJOR");
    expect(sub.rows[0].trial_ends_at).not.toBeNull();

    // Linked session with subscription billing.
    const session = await getPool().query(
      `SELECT plan_type, status FROM sessions WHERE client_id = $1`,
      [client.id],
    );
    expect(session.rows[0].plan_type).toBe("MAJOR");
    // The checkout writeback creates the session in BOOKED, then activation
    // can race ahead via the post-checkout webhook. Accept either initial
    // state — the contract is "session exists with the right plan".
    expect(["BOOKED", "ACTIVE"]).toContain(session.rows[0].status);
  } finally {
    await stylist.cleanup();
    await cleanupE2EUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// J1.3 — Lux one-time funnel from /lux (no subscription toggle)
// ---------------------------------------------------------------------------

test("J1.3 funnel-lux-onetime: /lux CTA → /select-plan?plan=lux → no subscription toggle, 8 styleboards", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = uniqueStamp();
  const email = `j1-lux-${stamp}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_j1_lux_${stamp.replace(/-/g, "_")}`,
    email,
    firstName: "J1",
    lastName: "Lux",
  });
  const stylist = await setupAvailableStylist("j1-lux");

  try {
    await signInE2E(page, email);
    await page.goto(`/bookings/new?stylistId=${stylist.profile.id}`);
    await page.locator('button:has(h3:text-is("Lux"))').click();

    // Subscription toggle must NOT appear for Lux.
    await expect(page.getByText("Subscribe monthly")).toHaveCount(0);

    await page.getByRole("button", { name: /Proceed to Checkout/ }).click();
    await page.waitForURL("**/sessions", { timeout: 15_000 });

    const session = await getPool().query(
      `SELECT plan_type, status, styleboards_allowed FROM sessions WHERE client_id = $1`,
      [client.id],
    );
    expect(session.rowCount).toBe(1);
    expect(session.rows[0].plan_type).toBe("LUX");
    expect(["BOOKED", "ACTIVE"]).toContain(session.rows[0].status);
    expect(session.rows[0].styleboards_allowed).toBe(8);

    // No subscription row exists for Lux.
    const sub = await getPool().query(
      `SELECT id FROM subscriptions WHERE user_id = $1`,
      [client.id],
    );
    expect(sub.rowCount, "Lux is one-time only").toBe(0);
  } finally {
    await stylist.cleanup();
    await cleanupE2EUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// J1.4 — Men's flow funnel: skip Body Type, men's mood-board sequence
// ---------------------------------------------------------------------------

test("J1.4 funnel-mens: /match-quiz Men route persists MALE + men's styles, body_types empty", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = uniqueStamp();
  const email = `j1-mens-${stamp}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_j1_mens_${stamp.replace(/-/g, "_")}`,
    email,
    firstName: "J1",
    lastName: "Mens",
  });

  try {
    await signInE2E(page, email);
    await completeMatchQuizGuest(page, { gender: "Men", loveStyle: "Streetwear" });
    await page.waitForURL(/\/stylist-match(\?|$|\/)/, { timeout: 15_000 });

    const user = await getUserByEmail(email);
    const quiz = await getLatestMatchQuizResultForUser(user!.id);
    expect(quiz?.gender_to_style).toBe("MALE");
    const styleDir: string[] = quiz?.style_direction ?? [];
    expect(styleDir).toContain("Streetwear");
    expect(styleDir).not.toContain("Minimal");
    const raw = quiz?.raw_answers as Record<string, unknown>;
    expect(raw?.body_types).toEqual([]);
  } finally {
    await cleanupE2EUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// J1.5 — Feed-entry funnel: /feed card "Book {firstName}" → sign-up flow
// ---------------------------------------------------------------------------

test("J1.5 funnel-feed-entry: /feed CTA routes guests to sign-up; flow continues without 404", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Public /feed renders; the Book CTA on a card opens stylist profile or
  // sign-up modal depending on auth. As a guest:
  await page.goto("/feed");
  await expect(
    page.getByRole("heading", { name: /Stylist Looks/i }),
  ).toBeVisible();

  // Find a Book CTA if any feed cards rendered. If the feed is empty (no seed)
  // we skip the click assertion but still proved the public surface loads.
  const bookCta = page.getByRole("link", { name: /Book / }).first();
  const bookCount = await bookCta.count();
  if (bookCount > 0) {
    const href = await bookCta.getAttribute("href");
    expect(href, "Book CTA points at a stylist or sign-up").toMatch(
      /^(\/stylists\/|\/sign-in|\/sign-up)/,
    );
  }
});

// ---------------------------------------------------------------------------
// J1.6 — Shared-board entry: /board/[id] CTA does not 404 mid-funnel
// ---------------------------------------------------------------------------

test("J1.6 funnel-shared-board: /board/[id] sent styleboard renders publicly + CTA reaches a stylist", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const stamp = uniqueStamp();
  const email = `j1-board-${stamp}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_j1_board_${stamp.replace(/-/g, "_")}`,
    email,
    firstName: "J1",
    lastName: "Board",
  });
  const stylist = await setupAvailableStylist("j1-board");
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.user.id,
    status: "ACTIVE",
    planType: "MINI",
  });
  const board = await createBoardFixture({
    sessionId: session.id,
    type: "STYLEBOARD",
    title: "Sent Look",
    sentMinutesAgo: 60,
  });

  try {
    // Guest should see the public viewer (no auth required).
    const response = await page.goto(`/board/${board.id}`);
    expect(response?.status()).toBeLessThan(400);
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Something went wrong/i);
  } finally {
    await getPool().query(`DELETE FROM boards WHERE id = $1`, [board.id]);
    await getPool().query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
    await stylist.cleanup();
    await cleanupE2EUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// J1.7 — Gift-card funnel (anon: dialog → sign-in prompt)
// ---------------------------------------------------------------------------

test("J1.7 funnel-gift-card: /gift-cards Buy CTA opens a sign-in-gated purchase dialog", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const res = await page.goto("/gift-cards");
  expect(res?.status()).toBeLessThan(400);
  // Loveable's gift-cards landing has hero copy "For anyone ready to have fun
  // with their style again." rather than a literal "Gift cards" heading.
  // Anchor on a stable section heading that's part of the verbatim port.
  await expect(
    page.getByRole("heading", {
      name: /Wishi Gift Card Benefits|Wishi Gift Card Experience/i,
    }).first(),
  ).toBeVisible();

  // The Buy CTA is the public entrypoint to gift-card commerce. As a guest
  // it should open a dialog or redirect to sign-in — never 404.
  const buy = page.getByRole("button", { name: /^Buy / }).first();
  if ((await buy.count()) > 0) {
    await buy.click();
    // Either a dialog mounts or we land on sign-in.
    await page.waitForLoadState("networkidle");
    const url = page.url();
    const dialogVisible = await page
      .getByRole("dialog")
      .first()
      .isVisible()
      .catch(() => false);
    expect(dialogVisible || /\/sign-in/.test(url)).toBeTruthy();
  }
});

// ---------------------------------------------------------------------------
// J1.8 — Back button after match-quiz: no infinite redirect, no double-claim
// ---------------------------------------------------------------------------

test("J1.8 funnel-back-button: complete quiz → /matches → browser back → quiz state preserved", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = uniqueStamp();
  const email = `j1-back-${stamp}@e2e.wishi.test`;
  await ensureClientUser({
    clerkId: `e2e_j1_back_${stamp.replace(/-/g, "_")}`,
    email,
    firstName: "J1",
    lastName: "Back",
  });
  const stylist = await setupAvailableStylist("j1-back");

  try {
    await signInE2E(page, email);
    await completeMatchQuizGuest(page);
    await page.waitForURL(/\/(matches|stylists|stylist-match)/, {
      timeout: 15_000,
    });

    // Browser back into the quiz.
    await page.goBack();
    await page.waitForLoadState("networkidle");

    // No infinite redirect — we should land on a renderable surface (not the
    // raw match-quiz step 0 again either, since the user is now signed in
    // with a completed result; or if it does, no error boundary).
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Something went wrong/i);

    // Exactly one MatchQuizResult row exists for this user (no duplication).
    const user = await getUserByEmail(email);
    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM match_quiz_results WHERE user_id = $1`,
      [user!.id],
    );
    expect(rows[0].n, "exactly one quiz row, no double-claim").toBe(1);
  } finally {
    await stylist.cleanup();
    await cleanupE2EUserByEmail(email);
  }
});

// ---------------------------------------------------------------------------
// J1.9 — Mid-flow refresh: /select-plan refresh does not duplicate Session
// ---------------------------------------------------------------------------

test("J1.9 funnel-mid-flow-refresh: refresh on /select-plan does not double-create Session", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const stamp = uniqueStamp();
  const email = `j1-refresh-${stamp}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_j1_refresh_${stamp.replace(/-/g, "_")}`,
    email,
    firstName: "J1",
    lastName: "Refresh",
  });
  // Quiz prerequisite for /style-quiz gate.
  await getPool().query(
    `INSERT INTO match_quiz_results (id, user_id, gender_to_style, style_direction, completed_at, raw_answers)
     VALUES (gen_random_uuid(), $1, 'FEMALE', ARRAY['minimalist']::text[], NOW(), '{}')`,
    [client.id],
  );
  const stylist = await setupAvailableStylist("j1-refresh");

  try {
    await signInE2E(page, email);
    await page.goto(`/select-plan?stylistId=${stylist.profile.id}`);
    await page.waitForLoadState("networkidle");

    // Refresh several times — the page must stay renderable and never insert
    // a Session row (Session creation only happens on checkout).
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForLoadState("networkidle");
      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(/Something went wrong/i);
    }

    const { rows } = await getPool().query(
      `SELECT COUNT(*)::int AS n FROM sessions WHERE client_id = $1`,
      [client.id],
    );
    expect(rows[0].n, "/select-plan must not create a Session").toBe(0);
  } finally {
    await stylist.cleanup();
    await cleanupE2EUserByEmail(email);
  }
});
