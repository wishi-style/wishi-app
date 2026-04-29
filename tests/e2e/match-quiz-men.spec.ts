// tests/e2e/match-quiz-men.spec.ts
import { test, expect } from "@playwright/test";
import {
  ensureClientUser,
  cleanupE2EUserByEmail,
  getPool,
} from "./db";

const MEN_BOARD_ORDER = [
  "Streetwear",
  "Rugged",
  "Edgy",
  "Cool",
  "Elegant",
] as const;

async function signInAsClient(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test.describe("match-quiz men's flow", () => {
  test("Men route skips Body Type and cycles men's mood boards in Loveable order", async ({
    page,
  }) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const email = `mens-flow-${stamp}@e2e.wishi.test`;
    await ensureClientUser({
      clerkId: `e2e_mens_flow_${stamp}`,
      email,
      firstName: "Mens",
      lastName: "Flow",
    });

    try {
      await signInAsClient(page, email);

      await page.goto("/match-quiz");
      await expect(page.getByText("NEEDS", { exact: true })).toBeVisible();

      // Skip Needs to advance to Department.
      await page.getByRole("button", { name: "Skip" }).click();
      await expect(page.getByText("DEPARTMENT", { exact: true })).toBeVisible();

      // Pick Men. The button has aria-label="Choose Men".
      await page.getByRole("button", { name: "Choose Men" }).click();

      // Should jump straight to STYLE, never showing BODY TYPE.
      await expect(page.getByText("STYLE", { exact: true })).toBeVisible();
      await expect(page.getByText("BODY TYPE", { exact: true })).not.toBeVisible();

      // Verify mood-board sequence and the department-aware aria-label.
      // LOVE IT for Streetwear (0) and Edgy (2); NO for the rest.
      for (let i = 0; i < MEN_BOARD_ORDER.length; i++) {
        const name = MEN_BOARD_ORDER[i];
        await expect(
          page.getByRole("heading", { name: `Do you like ${name} style?` }),
        ).toBeVisible();

        const vote = i === 0 || i === 2 ? "LOVE IT" : "NO";
        await page
          .getByRole("button", { name: `${vote} for ${name}` })
          .click();

        // 500ms transition baked into handleStyleVote.
        await page.waitForTimeout(600);
      }

      // After last vote, signed-in users redirect to /stylist-match.
      await page.waitForURL(/\/stylist-match(\?|$|\/)/, { timeout: 10000 });

      // Verify DB persisted the men's payload correctly.
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT gender_to_style, style_direction, raw_answers
           FROM match_quiz_results
          WHERE user_id = (SELECT id FROM users WHERE email = $1)
       ORDER BY completed_at DESC
          LIMIT 1`,
        [email],
      );
      expect(rows.length).toBe(1);
      expect(rows[0].gender_to_style).toBe("MALE");

      const styleDirection: string[] = rows[0].style_direction ?? [];
      expect(styleDirection).toEqual(
        expect.arrayContaining(["Streetwear", "Edgy"]),
      );
      expect(styleDirection).not.toContain("Rugged");
      expect(styleDirection).not.toContain("Cool");
      expect(styleDirection).not.toContain("Elegant");
      // No women's style names should leak in.
      expect(styleDirection).not.toContain("Minimal");
      expect(styleDirection).not.toContain("Feminine");

      const raw = rows[0].raw_answers as Record<string, unknown>;
      expect(raw.body_types).toEqual([]);
    } finally {
      await cleanupE2EUserByEmail(email);
    }
  });

  test("Back button on Style step skips Body Type for men", async ({
    page,
  }) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const email = `mens-back-${stamp}@e2e.wishi.test`;
    await ensureClientUser({
      clerkId: `e2e_mens_back_${stamp}`,
      email,
      firstName: "Mens",
      lastName: "Back",
    });

    try {
      await signInAsClient(page, email);

      await page.goto("/match-quiz");
      await page.getByRole("button", { name: "Skip" }).click();
      await page.getByRole("button", { name: "Choose Men" }).click();
      await expect(page.getByText("STYLE", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Back" }).click();

      // Should land on DEPARTMENT, not BODY TYPE.
      await expect(page.getByText("DEPARTMENT", { exact: true })).toBeVisible();
      await expect(page.getByText("BODY TYPE", { exact: true })).not.toBeVisible();
    } finally {
      await cleanupE2EUserByEmail(email);
    }
  });

  test("Women route still uses women's mood boards", async ({ page }) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const email = `mens-regression-${stamp}@e2e.wishi.test`;
    await ensureClientUser({
      clerkId: `e2e_mens_regression_${stamp}`,
      email,
      firstName: "Mens",
      lastName: "Regression",
    });

    try {
      await signInAsClient(page, email);

      await page.goto("/match-quiz");
      await page.getByRole("button", { name: "Skip" }).click();
      await page.getByRole("button", { name: "Choose Women" }).click();

      // Body Type should appear for women.
      await expect(page.getByText("BODY TYPE", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Skip" }).click();

      // First women's board is Minimal.
      await expect(
        page.getByRole("heading", { name: "Do you like Minimal style?" }),
      ).toBeVisible();
    } finally {
      await cleanupE2EUserByEmail(email);
    }
  });
});
