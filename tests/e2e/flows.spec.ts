import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  createSessionForClient,
  createStyleProfileFixture,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistUser,
  getBodyProfileByUserId,
  getLatestMatchQuizResultForUser,
  getStyleProfileByUserId,
  getUserByEmail,
} from "./db";

test.afterAll(async () => {
  await disconnectTestDb();
});

test("guest match quiz is claimed when the user signs up", async ({ page }) => {
  const email = `guest-claim-${Date.now()}@e2e.wishi.test`;
  await cleanupE2EUserByEmail(email);

  await page.goto("/match-quiz");
  await page.getByRole("button", { name: "Women" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Minimalist" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Everyday" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "$50–$150" }).click();
  await page.getByRole("button", { name: "See My Matches" }).click();

  await expect(page).toHaveURL(/\/sign-up/);
  // /sign-up defaults to Clerk's real form; tests opt into the E2E form via ?e2e=1.
  await page.goto("/sign-up?e2e=1");
  await page.getByLabel("First name").fill("Guest");
  await page.getByLabel("Last name").fill("Claim");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page).toHaveURL(/\/stylists/);

  const user = await getUserByEmail(email);
  expect(user).not.toBeNull();

  const quiz = await getLatestMatchQuizResultForUser(user!.id);
  expect(quiz?.claimed_at).not.toBeNull();
  expect(quiz?.style_direction).toContain("minimalist");

  await cleanupE2EUserByEmail(email);
});

test("style preference quiz populates StyleProfile and BodyProfile", async ({ page }) => {
  const email = `style-quiz-${Date.now()}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_style_${Date.now()}`,
    email,
    firstName: "Style",
    lastName: "Quiz",
  });
  const session = await createSessionForClient({
    clientId: client.id,
  });

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);

  await page.goto(`/sessions/${session.id}/style-quiz`);

  // Q1: style preferences (multi-select)
  await page.getByRole("button", { name: "Minimalist" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Q2: style icons (text, skip)
  await page.getByRole("button", { name: "Next" }).click();
  // Q3: adventurous slider (range, keep default)
  await page.getByRole("button", { name: "Next" }).click();
  // Q4: dress code
  await page.getByRole("button", { name: "Casual", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Q5-Q7: text fields, skip
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Q8: body type
  await page.getByRole("button", { name: "Hourglass" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Q9: body concerns (text, skip)
  await page.getByRole("button", { name: "Next" }).click();
  // Q10: highlight areas
  await page.getByRole("button", { name: "Waist" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Q11: height (text, skip)
  await page.getByRole("button", { name: "Next" }).click();
  // Q12: top fit
  await page.getByRole("button", { name: "Regular" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  // Q13-Q21: remaining optional questions, skip
  for (let i = 0; i < 9; i += 1) {
    await page.getByRole("button", { name: "Next" }).click();
  }
  // Q22: submit
  await page.getByRole("button", { name: "See My Matches" }).click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${session.id}$`));

  const [styleProfile, bodyProfile] = await Promise.all([
    getStyleProfileByUserId(client.id),
    getBodyProfileByUserId(client.id),
  ]);

  expect(styleProfile?.style_preferences).toContain("minimalist");
  expect(styleProfile?.dress_code).toBe("casual");
  expect(styleProfile?.quiz_completed_at).not.toBeNull();
  expect(bodyProfile?.body_type).toBe("hourglass");
  expect(bodyProfile?.highlight_areas).toContain("waist");
  expect(bodyProfile?.top_fit).toBe("REGULAR");

  await cleanupE2EUserByEmail(email);
});

test("session flows show the correct CTAs for unfinished and completed quiz states", async ({ page, context }) => {
  const pendingEmail = `session-pending-${Date.now()}@e2e.wishi.test`;
  const styledEmail = `session-styled-${Date.now()}@e2e.wishi.test`;
  const stylistEmail = `session-stylist-${Date.now()}@e2e.wishi.test`;

  const pendingClient = await ensureClientUser({
    clerkId: `e2e_pending_${Date.now()}`,
    email: pendingEmail,
    firstName: "Pending",
    lastName: "Client",
  });
  const pendingSession = await createSessionForClient({
    clientId: pendingClient.id,
  });

  const styledClient = await ensureClientUser({
    clerkId: `e2e_styled_${Date.now()}`,
    email: styledEmail,
    firstName: "Styled",
    lastName: "Client",
  });
  await createStyleProfileFixture(styledClient.id);
  const stylist = await ensureStylistUser({
    clerkId: `e2e_stylist_${Date.now()}`,
    email: stylistEmail,
    firstName: "Taylor",
    lastName: "Stylist",
  });
  const styledSession = await createSessionForClient({
    clientId: styledClient.id,
    status: "ACTIVE",
    stylistId: stylist.id,
  });

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(pendingEmail);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);
  await expect(page.getByText("Finding stylist...")).toBeVisible();
  await page.getByRole("link", { name: /Mini Session/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${pendingSession.id}$`));
  await expect(page.getByRole("link", { name: "Complete Style Quiz" })).toBeVisible();
  await expect(page.getByText("We're finding the perfect stylist for you...")).toBeVisible();

  await context.clearCookies();

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(styledEmail);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/sessions/);
  await expect(page.getByText("Taylor Stylist")).toBeVisible();
  await page.getByRole("link", { name: /Mini Session/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/sessions/${styledSession.id}$`));
  await expect(page.getByText("Taylor Stylist")).toBeVisible();
  await expect(page.getByRole("link", { name: "Complete Style Quiz" })).toHaveCount(0);

  await cleanupE2EUserByEmail(pendingEmail);
  await cleanupE2EUserByEmail(styledEmail);
  await cleanupE2EUserByEmail(stylistEmail);
});
