import { expect, test } from "@playwright/test";

/**
 * Regression: the styleboard "Restyle" wizard footer (Submit / Skip /
 * Add Feedback) must always be visible inside the dialog viewport. A
 * fixed `h-[70vh]` inner with no `max-h` clamp on `DialogContent` and
 * non-`shrink-0` flex children let the footer spill below `overflow-hidden`
 * on shorter viewports, leaving users unable to send feedback. This spec
 * pins the fix at three viewport heights — desktop, laptop, and a tight
 * 600px window — for both wizard steps.
 */

const VIEWPORTS = [
  { width: 1280, height: 900, label: "desktop" },
  { width: 1280, height: 720, label: "laptop" },
  { width: 1280, height: 600, label: "small" },
] as const;

for (const vp of VIEWPORTS) {
  test(`restyle wizard: select-step Add Feedback button visible @ ${vp.label} ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dev/restyle-wizard-harness");

    const addFeedbackBtn = page.getByRole("button", { name: "Add Feedback" });
    await expect(addFeedbackBtn).toBeVisible();
    await expect(addFeedbackBtn).toBeInViewport();
  });

  test(`restyle wizard: feedback-step Submit button visible @ ${vp.label} ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dev/restyle-wizard-harness");

    // Step 1: select all 3 products, advance to feedback step.
    await page.getByRole("button", { name: "Select All" }).click();
    await page.getByRole("button", { name: "Add Feedback" }).click();

    // Step 2: walk to the last item where the button reads "Submit".
    // Spec products array has 3 entries, so the wizard renders Next twice
    // before the final Submit.
    await expect(page.getByText("1 of 3 Items")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("2 of 3 Items")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("3 of 3 Items")).toBeVisible();

    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeInViewport();

    // Skip is the secondary affordance on every step — confirm both pinned.
    const skipBtn = page.getByRole("button", { name: "Skip" });
    await expect(skipBtn).toBeVisible();
    await expect(skipBtn).toBeInViewport();
  });

  test(`restyle wizard: single-item flow surfaces Submit on first item @ ${vp.label} ${vp.width}x${vp.height}`, async ({
    page,
  }) => {
    // The user-reported bug screenshot was a one-product look ("1 of 1
    // Items") — verify Submit shows immediately when only one item is
    // selected, not Next.
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/dev/restyle-wizard-harness");

    await page.locator('button:has-text("Rodd & Gunn")').click();
    await page.getByRole("button", { name: "Add Feedback" }).click();

    await expect(page.getByText("1 of 1 Items")).toBeVisible();
    const submitBtn = page.getByRole("button", { name: "Submit" });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeInViewport();
  });
}
