# Match-Quiz Men's Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Loveable smart-spark-craft's men's match-quiz flow (`smart-spark-craft@3bd7440`) into `wishi-app/src/app/match-quiz/match-quiz-client.tsx` at 1:1 parity.

**Architecture:** Single client component on a single route. Adds `menStyleBoards`, branches on `department === "MEN"` for both step routing and active mood-board set, simplifies the department selector to Loveable's pill-button design, removes the rebuild-only styles counter for parity. Backend (`submitMatchQuiz` server action, MatchQuizResult schema, matcher) unchanged.

**Tech Stack:** Next.js 16 App Router, React client component, Tailwind, Playwright (`E2E_AUTH_MODE=true`), Prisma over Postgres.

**Spec:** `docs/superpowers/specs/2026-04-29-match-quiz-mens-flow-design.md`.

**Branch:** `match-quiz-mens-flow` (already created, spec already committed at `7f4de83`).

---

## File map

- **Create**: `wishi-app/public/img/men-streetwear.png`, `men-rugged.png`, `men-edgy.png`, `men-cool.png`, `men-elegant.png` (binary copy from `smart-spark-craft/src/assets/men-*.png`).
- **Create**: `wishi-app/tests/e2e/match-quiz-men.spec.ts` — two-test Playwright spec.
- **Modify**: `wishi-app/src/app/match-quiz/match-quiz-client.tsx` — the 10 deltas from the spec.
- **Modify**: `wishi-app/CLAUDE.md` — append a one-line entry under the post-Phase-10 parity sweep section.
- **Modify**: `../WISHI-REBUILD-PLAN.md` (one level up from wishi-app) — append entry for the men's flow port.

No visual-baseline refresh: `tests/visual/marketing.spec.ts` captures `/match-quiz` at step 0 (NEEDS); the dept-selector swap is on step 1.

---

## Task 1: Copy men's mood-board assets

**Files:**
- Create: `wishi-app/public/img/men-streetwear.png`
- Create: `wishi-app/public/img/men-rugged.png`
- Create: `wishi-app/public/img/men-edgy.png`
- Create: `wishi-app/public/img/men-cool.png`
- Create: `wishi-app/public/img/men-elegant.png`

- [ ] **Step 1: Copy the 5 PNGs**

```bash
cp /Users/matthewcardozo/Wishi/wishi-style/smart-spark-craft/src/assets/men-streetwear.png public/img/men-streetwear.png
cp /Users/matthewcardozo/Wishi/wishi-style/smart-spark-craft/src/assets/men-rugged.png     public/img/men-rugged.png
cp /Users/matthewcardozo/Wishi/wishi-style/smart-spark-craft/src/assets/men-edgy.png       public/img/men-edgy.png
cp /Users/matthewcardozo/Wishi/wishi-style/smart-spark-craft/src/assets/men-cool.png       public/img/men-cool.png
cp /Users/matthewcardozo/Wishi/wishi-style/smart-spark-craft/src/assets/men-elegant.png    public/img/men-elegant.png
```

> Note: smart-spark-craft local main is at `8dfd181`, but those PNGs were added in `9c111f4`/`c45717c` and are already present in the working tree from an earlier `git checkout origin/main -- .`. If they aren't in the working tree, run `git -C /Users/matthewcardozo/Wishi/wishi-style/smart-spark-craft show origin/main:src/assets/men-streetwear.png > /tmp/men-streetwear.png` etc. and copy from there.

- [ ] **Step 2: Verify file sizes are non-zero**

Run: `ls -l public/img/men-*.png`

Expected: 5 files, each between 400KB and 500KB.

- [ ] **Step 3: Commit assets**

```bash
git add public/img/men-streetwear.png public/img/men-rugged.png public/img/men-edgy.png public/img/men-cool.png public/img/men-elegant.png
git commit -m "$(cat <<'EOF'
feat(match-quiz): add men's mood-board assets from Loveable

Copies men-{streetwear,rugged,edgy,cool,elegant}.png from
smart-spark-craft@3bd7440 into public/img/ following the existing
women-mood-board convention (/img/style-*.png).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Write the failing Playwright spec

**Files:**
- Create: `wishi-app/tests/e2e/match-quiz-men.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// tests/e2e/match-quiz-men.spec.ts
import { test, expect } from "@playwright/test";
import { ensureClientUser, cleanupE2EUserByEmail, getPool } from "./db";

const MEN_BOARD_ORDER = [
  "Streetwear",
  "Rugged",
  "Edgy",
  "Cool",
  "Elegant",
] as const;

async function signInAsClient(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test.describe("match-quiz men's flow", () => {
  test("Men route skips Body Type and cycles men's mood boards in Loveable order", async ({
    page,
  }) => {
    const email = `mens-flow-${Date.now()}@e2e.wishi.test`;
    await ensureClientUser(email);

    try {
      await signInAsClient(page, email);

      await page.goto("/match-quiz");
      await expect(page.getByText("NEEDS", { exact: true })).toBeVisible();

      // Skip Needs to advance to Department.
      await page.getByRole("button", { name: "Skip" }).click();
      await expect(page.getByText("DEPARTMENT", { exact: true })).toBeVisible();

      // Pick Men. The exact pill button.
      await page.getByRole("button", { name: "Men", exact: true }).click();

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
       ORDER BY created_at DESC
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
    const email = `mens-back-${Date.now()}@e2e.wishi.test`;
    await ensureClientUser(email);

    try {
      await signInAsClient(page, email);

      await page.goto("/match-quiz");
      await page.getByRole("button", { name: "Skip" }).click();
      await page.getByRole("button", { name: "Men", exact: true }).click();
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
    const email = `mens-regression-${Date.now()}@e2e.wishi.test`;
    await ensureClientUser(email);

    try {
      await signInAsClient(page, email);

      await page.goto("/match-quiz");
      await page.getByRole("button", { name: "Skip" }).click();
      await page.getByRole("button", { name: "Women", exact: true }).click();

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
```

- [ ] **Step 2: Run the spec — it must fail**

Run:

```bash
npm run dev:e2e &
DEV_PID=$!
sleep 6
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)" \
  npx playwright test tests/e2e/match-quiz-men.spec.ts --reporter=list
kill $DEV_PID 2>/dev/null || true
```

Expected: at least 2 of the 3 tests **fail** because:
- Test 1 ("Men route skips Body Type…") fails on `expect(BODY TYPE).not.toBeVisible()` — the rebuild currently shows Body Type after Men selection.
- Test 2 ("Back button on Style step…") fails for the same reason.
- Test 3 ("Women route…") may pass already since the women's flow is intact.

This confirms the tests bite the gap correctly.

- [ ] **Step 3: Commit the failing spec**

```bash
git add tests/e2e/match-quiz-men.spec.ts
git commit -m "$(cat <<'EOF'
test(match-quiz): failing spec for men's flow + back-button skip

Three Playwright cases: men's flow skips Body Type and cycles
Streetwear → Rugged → Edgy → Cool → Elegant, back button on Style
skips Body Type for men, women's flow regression. Tests fail until
match-quiz-client.tsx ports the Loveable men's flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `menStyleBoards` and remove dead code

**Files:**
- Modify: `wishi-app/src/app/match-quiz/match-quiz-client.tsx`

- [ ] **Step 1: Read the file first** (required by editor)

```bash
wc -l src/app/match-quiz/match-quiz-client.tsx
```

Expected: 542 lines.

- [ ] **Step 2: Add `menStyleBoards` after `styleBoards`**

Insert immediately after the `styleBoards` declaration (currently lines 51–59):

```tsx
const menStyleBoards = [
  { name: "Streetwear", board: "/img/men-streetwear.png" },
  { name: "Rugged", board: "/img/men-rugged.png" },
  { name: "Edgy", board: "/img/men-edgy.png" },
  { name: "Cool", board: "/img/men-cool.png" },
  { name: "Elegant", board: "/img/men-elegant.png" },
] as const;
```

- [ ] **Step 3: Delete `womenImages` + `menImages` arrays**

Currently lines 61–77 in the unmodified file. Delete the full `womenImages` and `menImages` constants. They're unreferenced after Task 5 swaps the dept selector.

- [ ] **Step 4: Delete the `CollageGrid` component**

Currently lines 103–135 in the unmodified file. Delete the entire `function CollageGrid(...)` definition. It's only used by the old dept selector.

- [ ] **Step 5: Verify file still typechecks (will fail later steps' tests, but compile is green)**

Run: `npm run typecheck`

Expected: PASS (no references to the deleted symbols yet — Task 5 was the only consumer of `womenImages`/`menImages`/`CollageGrid` and we'll remove the consumer in Task 5).

If typecheck fails with "Cannot find name `CollageGrid`" or similar, the Task 5 dept-selector swap reference must already be in this file from a botched merge — abort and re-read.

---

## Task 4: Wire `activeStyleBoards` and update Style step

**Files:**
- Modify: `wishi-app/src/app/match-quiz/match-quiz-client.tsx`

- [ ] **Step 1: Add `activeStyleBoards` after the existing state hooks**

Inside `MatchQuizClient`, immediately after the `const toggleList = ...` line (currently line 240), add:

```tsx
const activeStyleBoards =
  department === "MEN" ? menStyleBoards : styleBoards;
```

- [ ] **Step 2: Replace `handleStyleVote` to read from `activeStyleBoards`**

Old (currently lines 294–309):

```tsx
const handleStyleVote = (vote: string) => {
  if (selectedVote || isPending) return;
  setSelectedVote(vote);
  const styleName = styleBoards[styleIndex].name;
  setTimeout(() => {
    const updated = { ...stylePrefs, [styleName]: vote };
    setStylePrefs(updated);
    setSelectedVote(null);

    if (styleIndex < styleBoards.length - 1) {
      setStyleIndex((i) => i + 1);
    } else {
      finishOnboarding(updated);
    }
  }, 500);
};
```

New:

```tsx
const handleStyleVote = (vote: string) => {
  if (selectedVote || isPending) return;
  setSelectedVote(vote);
  const styleName = activeStyleBoards[styleIndex].name;
  setTimeout(() => {
    const updated = { ...stylePrefs, [styleName]: vote };
    setStylePrefs(updated);
    setSelectedVote(null);

    if (styleIndex < activeStyleBoards.length - 1) {
      setStyleIndex((i) => i + 1);
    } else {
      finishOnboarding(updated);
    }
  }, 500);
};
```

- [ ] **Step 3: Replace step-3 JSX to read from `activeStyleBoards`**

Replace the entire `{step === 3 && (...)}` block (currently lines 457–538) with:

```tsx
{step === 3 && (
  <>
    <h1 className="font-display text-2xl md:text-3xl text-center mb-6 transition-opacity duration-300">
      Do you like {activeStyleBoards[styleIndex].name} style?
    </h1>

    <StyleMoodBoard
      src={activeStyleBoards[styleIndex].board}
      name={activeStyleBoards[styleIndex].name}
    />

    <div className="flex items-center justify-center gap-10 mt-6">
      {(["LOVE IT", "SOMETIMES", "NO"] as const).map((vote) => {
        const isSelected = selectedVote === vote;
        const isLove = vote === "LOVE IT";
        const isNo = vote === "NO";
        return (
          <button
            key={vote}
            type="button"
            onClick={() => handleStyleVote(vote)}
            className="group flex flex-col items-center gap-2"
            disabled={!!selectedVote || isPending}
            aria-label={`${vote} for ${activeStyleBoards[styleIndex].name}`}
          >
            <div
              className={cn(
                "h-10 w-10 rounded-full border-2 transition-all duration-300 ease-out flex items-center justify-center",
                isSelected && isLove
                  ? "border-destructive bg-destructive scale-125"
                  : isSelected && isNo
                    ? "border-foreground/40 bg-foreground/10 scale-95"
                    : isSelected
                      ? "border-foreground bg-foreground scale-110"
                      : "border-foreground/60 group-hover:border-foreground group-hover:bg-foreground/10",
              )}
            >
              {isSelected && isLove && (
                <HeartIcon className="h-4 w-4 text-destructive-foreground fill-current" />
              )}
              {isSelected && isNo && (
                <XIcon className="h-4 w-4 text-foreground/50" />
              )}
              {isSelected && !isLove && !isNo && (
                <CheckIcon className="h-4 w-4 text-background" />
              )}
            </div>
            <span
              className={cn(
                "text-xs tracking-wider transition-colors duration-300",
                isSelected && isLove
                  ? "text-destructive"
                  : isSelected && isNo
                    ? "text-foreground/40"
                    : isSelected
                      ? "text-foreground"
                      : "text-foreground/80 group-hover:text-foreground",
              )}
            >
              {vote}
            </span>
          </button>
        );
      })}
    </div>

    {(isPending || submitError) && (
      <p
        className={cn(
          "mt-4 text-xs",
          submitError ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {submitError ?? "Saving your answers…"}
      </p>
    )}
  </>
)}
```

Key parity changes versus the current step-3 JSX:
- `styleBoards[styleIndex]` → `activeStyleBoards[styleIndex]` (3 sites: title, `<StyleMoodBoard>`, `aria-label`).
- The `<p className="mt-8 text-xs text-muted-foreground tracking-wider">{styleIndex + 1} / {styleBoards.length} styles</p>` counter is **removed** (Loveable does not render it).

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

---

## Task 5: Replace department selector + update `goBack`

**Files:**
- Modify: `wishi-app/src/app/match-quiz/match-quiz-client.tsx`

- [ ] **Step 1: Replace `goBack`**

Old (currently line 244):

```tsx
const goBack = () => (step === 0 ? router.back() : setStep((s) => s - 1));
```

New:

```tsx
const goBack = () => {
  if (step === 0) {
    router.back();
    return;
  }
  if (step === 3 && department === "MEN") {
    setStep(1);
    return;
  }
  setStep((s) => s - 1);
};
```

- [ ] **Step 2: Replace step-1 JSX (the department selector)**

Replace the entire `{step === 1 && (...)}` block (currently lines 402–442) with the Loveable pill-button version:

```tsx
{step === 1 && (
  <>
    <h1 className="font-display text-3xl md:text-4xl text-center mb-2 max-w-xl">
      Great! We have a perfect plan for your needs.
    </h1>
    <p className="text-sm text-muted-foreground mb-10">
      What&apos;s your preferred shopping department?
    </p>

    <div className="flex flex-col sm:flex-row gap-4 max-w-md w-full">
      {(["WOMEN", "MEN"] as const).map((value) => {
        const label = value === "WOMEN" ? "Women" : "Men";
        const active = department === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => {
              setDepartment(value);
              setStyleIndex(0);
              try {
                localStorage.setItem("wishi_department", value);
              } catch {
                // localStorage unavailable (private mode, etc.) — proceed silently.
              }
              setStep(value === "MEN" ? 3 : 2);
            }}
            className={cn(
              "flex-1 rounded-full border-2 py-6 font-body text-lg font-normal tracking-wide transition-all duration-200",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/80 bg-transparent text-foreground hover:bg-foreground hover:text-background",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  </>
)}
```

Key behaviours mirrored from Loveable:
- Two pill buttons, no collage, no per-card images.
- onClick: `setDepartment(value)`, `setStyleIndex(0)`, `localStorage.setItem("wishi_department", value)` (best-effort), `setStep(value === "MEN" ? 3 : 2)`.

- [ ] **Step 3: Run typecheck and lint**

Run:

```bash
npm run typecheck && npm run lint
```

Expected: both PASS. The deleted `womenImages` / `menImages` / `CollageGrid` references are now gone (they were only consumed by the old step-1 JSX, which we just replaced).

If lint flags an unused import, remove it. (`Image` from `next/image` is still used by `<StyleMoodBoard>`; `next/image` import stays.)

- [ ] **Step 4: Commit the component changes**

```bash
git add src/app/match-quiz/match-quiz-client.tsx
git commit -m "$(cat <<'EOF'
feat(match-quiz): port Loveable men's flow

Mirrors smart-spark-craft@3bd7440. Men route now skips Body Type
forward + back, Style step shows Streetwear → Rugged → Edgy → Cool →
Elegant via activeStyleBoards. Department selector simplified to two
pill buttons with localStorage persistence (drops the CollageGrid +
unused women/men image arrays). Removes the rebuild-only styles
counter under the vote buttons for 1:1 pixel parity with Loveable.

Backend untouched: gender_to_style still maps MEN → MALE, body_types
remains [] for men, style_direction picks up men's style names from
stylePrefs as-is.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Run the Playwright spec — must pass

**Files:** none modified.

- [ ] **Step 1: Run the men's-flow spec**

```bash
npm run dev:e2e &
DEV_PID=$!
sleep 6
DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)" \
  npx playwright test tests/e2e/match-quiz-men.spec.ts --reporter=list
kill $DEV_PID 2>/dev/null || true
```

Expected: 3 passed, 0 failed.

If a test fails:
- "BODY TYPE not visible" assertion fail → the dept onClick `setStep(value === "MEN" ? 3 : 2)` didn't land. Re-check Task 5 Step 2.
- Heading "Do you like Streetwear style?" not found → `activeStyleBoards` not wired. Re-check Task 4.
- DB query returns 0 rows → the SignUp redirect path didn't actually persist. Authed flow should hit `submitMatchQuiz` and write directly without the SignUp modal — confirm `signedIn` was true on the page.

- [ ] **Step 2: Run a smoke check on the women's flow visually**

```bash
npm run dev &
DEV_PID=$!
sleep 6
curl -sI http://localhost:3000/match-quiz | head -1
kill $DEV_PID 2>/dev/null || true
```

Expected: `HTTP/1.1 200 OK`.

---

## Task 7: Run the full local verify chain

**Files:** none modified.

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: 0 errors. (Warnings allowed; new code should not introduce any.)

- [ ] **Step 3: Unit tests**

```bash
npm test
```

Expected: 271/302 passing, 0 failing, 31 skipped (or whatever the prior baseline was). No new failures attributable to this branch.

- [ ] **Step 4: Visual regression — confirm no unexpected diff at `/match-quiz`**

```bash
npm run test:visual -- --grep match-quiz
```

Expected: PASS at both `desktop-chrome` and `mobile-chrome` projects. The visual baseline captures step 0 (NEEDS) which is unchanged. If this fails, an unintended step-0 change leaked in — investigate before continuing.

- [ ] **Step 5: Price grep gate (sanity)**

```bash
rg -n '"\$60|"\$130|"\$550|"\$20|6000|13000|55000|2000' src/ \
  -g '!lib/plans.ts' -g '!lib/ui/plan-copy.ts' \
  -g '!**/*.test.*' -g '!**/*.md'
```

Expected: 0 matches. This branch doesn't touch prices, but the gate is cheap insurance.

---

## Task 8: Update CLAUDE.md and the rebuild plan doc

**Files:**
- Modify: `wishi-app/CLAUDE.md`
- Modify: `../WISHI-REBUILD-PLAN.md` (one level up — `/Users/matthewcardozo/Wishi/wishi-style/WISHI-REBUILD-PLAN.md`)

- [ ] **Step 1: Append entry under the post-Phase-10 sweep in CLAUDE.md**

Find the "P2 audit batch (PRs #76 / #77 / #78 / #80, all merged 2026-04-28)" subsection inside `## Post-Phase-10 design parity sweep (Loveable catch-up)`. Append a new subsection **after** that block and **before** "**Style-quiz flow (locked 2026-04-24):**":

```markdown
**Match-quiz men's flow (PR #__ merged 2026-04-29):** PR #79's funnel port stopped one Loveable commit short of the men's flow. Picking Men routed through the women's Body Type chip step and the women's mood-board sequence. This PR mirrors `smart-spark-craft@3bd7440` — `menStyleBoards` (Streetwear → Rugged → Edgy → Cool → Elegant), Body Type skipped for men forward + back via `setStep(value === "MEN" ? 3 : 2)` and the `goBack` exception, department selector simplified to two pill buttons (drops `CollageGrid` + the unused `womenImages` / `menImages` arrays), `localStorage.wishi_department` persisted on selection. The rebuild-only `{styleIndex + 1} / {styleBoards.length} styles` counter is removed for 1:1 pixel parity (Loveable doesn't render it). Backend wire-up unchanged — `gender_to_style` still maps `MEN → MALE`, `body_types` stays empty for men, `style_direction` reads liked names from `stylePrefs`. Coverage: `tests/e2e/match-quiz-men.spec.ts` (3 cases — men's flow + back-button skip + women's regression) under `E2E_AUTH_MODE`. No visual baseline refresh needed — `/match-quiz` is captured at step 0 (NEEDS) which is unchanged.
```

Replace `#__` with the PR number after `gh pr create` in Task 9.

- [ ] **Step 2: Append entry under the parity-sweep section of WISHI-REBUILD-PLAN.md**

Open `../WISHI-REBUILD-PLAN.md`, find the corresponding parity-sweep section (search for "P2 audit batch" or "Post-Phase-10"), and append a single bullet:

```markdown
- **Match-quiz men's flow port** (PR #__ merged 2026-04-29): mirrored `smart-spark-craft@3bd7440` men's branch — Body Type skipped for men, `menStyleBoards` (Streetwear → Rugged → Edgy → Cool → Elegant), department selector simplified to pill buttons. Three-case Playwright spec at `tests/e2e/match-quiz-men.spec.ts`. Backend untouched.
```

If the section structure differs from CLAUDE.md, drop it under the closest equivalent heading and keep the wording the same.

- [ ] **Step 3: Commit doc updates**

```bash
git add CLAUDE.md ../WISHI-REBUILD-PLAN.md
git commit -m "$(cat <<'EOF'
docs: record match-quiz men's flow port

Updates the post-Phase-10 parity sweep section in CLAUDE.md and the
top-level WISHI-REBUILD-PLAN.md with the men's flow PR. PR # is
filled in once gh pr create returns.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Push and open the PR (waits for "vamos")

**Files:** none locally; remote operations only.

This task does **not** auto-execute. Per `feedback_vamos.md` (auto-memory), only run it after Matt says "vamos".

- [ ] **Step 1: Push the branch**

```bash
git push -u origin match-quiz-mens-flow
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat(match-quiz): port Loveable men's flow" --body "$(cat <<'EOF'
## Summary

- Ports `smart-spark-craft@3bd7440` men's flow into `/match-quiz` — picking Men now skips Body Type and shows Streetwear → Rugged → Edgy → Cool → Elegant.
- Simplifies department selector to Loveable's two pill buttons; drops `CollageGrid` + `womenImages` / `menImages`. Persists `localStorage.wishi_department` on selection.
- Removes the rebuild-only styles counter for 1:1 pixel parity (Loveable doesn't render it).

Backend untouched: `gender_to_style` maps `MEN → MALE`, `body_types` stays `[]` for men, `style_direction` reads liked names from `stylePrefs`.

## Test plan

- [x] `tests/e2e/match-quiz-men.spec.ts` — 3 cases: men's flow skips Body Type and cycles 5 men's boards in Loveable order; back button on Style skips Body Type; women's flow regression (Body Type still visible, first board is Minimal).
- [x] `npm run typecheck` clean
- [x] `npm run lint` clean
- [x] `npm test` — 0 new failures
- [x] `npm run test:visual -- --grep match-quiz` — step-0 baseline unchanged (visual harness only captures NEEDS, not the dept selector)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Update doc PR-numbers**

After `gh pr create` prints the URL, take the PR number and:

```bash
PR_NUM=<from gh output>
sed -i.bak "s/PR #__ merged 2026-04-29/PR #${PR_NUM} merged 2026-04-29/g" CLAUDE.md ../WISHI-REBUILD-PLAN.md
rm CLAUDE.md.bak ../WISHI-REBUILD-PLAN.md.bak
git add CLAUDE.md ../WISHI-REBUILD-PLAN.md
git commit --amend --no-edit
git push --force-with-lease
```

(Use `--force-with-lease`, never plain `--force` — and only on this feature branch, never on `main`.)

---

## Self-review checklist

- **Spec coverage:**
  - Add `menStyleBoards` → Task 3 Step 2 ✓
  - Copy 5 PNG assets → Task 1 ✓
  - Department onClick: setStep MEN→3 / WOMEN→2, setStyleIndex(0), localStorage write → Task 5 Step 2 ✓
  - Department UI swap (CollageGrid → pill buttons) → Task 5 Step 2 ✓
  - Delete `womenImages` / `menImages` / `CollageGrid` → Task 3 Steps 3 + 4 ✓
  - `activeStyleBoards` introduction → Task 4 Step 1 ✓
  - `handleStyleVote` reads `activeStyleBoards` → Task 4 Step 2 ✓
  - Step-3 JSX reads `activeStyleBoards` (title, `<StyleMoodBoard>`, `aria-label`) → Task 4 Step 3 ✓
  - Remove `{styleIndex + 1} / {styleBoards.length} styles` counter → Task 4 Step 3 ✓
  - `goBack` men-skip on step 3 → Task 5 Step 1 ✓
  - Body Type unreachable for men (no code change) → covered by Task 5 Step 2 routing ✓
  - `finishOnboarding` payload unchanged → no task; spec confirms no change ✓
  - Playwright spec → Task 2 + Task 6 ✓
  - Verify chain → Task 7 ✓
  - CLAUDE.md / WISHI-REBUILD-PLAN.md updates → Task 8 ✓

- **Placeholder scan:** all code blocks complete; no TBD/TODO; PR # placeholder is intentional and resolved in Task 9 Step 3.

- **Type consistency:** `menStyleBoards` is `as const` — same shape as `styleBoards` (`{ name: string; board: string }`). `activeStyleBoards` is the union `typeof menStyleBoards | typeof styleBoards`, indexable by number. `setDepartment` takes `"WOMEN" | "MEN" | null` per existing state typing — the `(["WOMEN", "MEN"] as const)` map values match.
