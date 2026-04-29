# Match-Quiz Men's Flow Port — Design

## Context

The post-Phase-10 client funnel port (PR #79, `match-quiz-client.tsx`) is missing the men's flow. After picking **Men** in step 1, the user falls through into the women's body-type chip step, then into the women's mood-board sequence (Minimal → Feminine → … → Sexy). Loveable smart-spark-craft `origin/main` (HEAD `3bd7440`) added a real men's flow plus a simplified department selector across commits `b7cc1bd`, `9c111f4`, `c45717c`, `3562568`, `04bc8bb`, `8dfd181`, `3bd7440`. This spec ports those changes 1:1.

**Source of truth:** `smart-spark-craft/src/pages/Onboarding.tsx@3bd7440`. Loveable is the standard. Mirror, do not paraphrase.

## Goals

1. Picking Men routes through a men-specific path: skip Body Type, show 5 men's mood boards in Loveable's order.
2. Department selector matches Loveable's current pill-button design (no collage).
3. Pixel parity with Loveable on `/match-quiz` for both viewports — visual-regression baselines refreshed under `<2%` delta.
4. Backend wire-up unchanged: `MEN → MALE` in `gender_to_style`, empty `body_types`, liked men's style names in `style_direction`.

## Non-goals

- `SessionCheckout.tsx` and `Profile.tsx` drift on Loveable (separate parity batch).
- "Seasonal Capsule" vs current "Seasonal Refresh" needs-chip copy drift (separate copy sweep).
- Background removal, AI suggestions, or any feature beyond the funnel.

## Loveable contract being mirrored

### Men's mood-board ordering (commit `3bd7440`)
```ts
const menStyleBoards = [
  { name: "Streetwear", board: menStreetwear },
  { name: "Rugged",     board: menRugged },
  { name: "Edgy",       board: menEdgy },
  { name: "Cool",       board: menCool },
  { name: "Elegant",    board: menElegant },
];
```
Files: `src/assets/men-{streetwear,rugged,edgy,cool,elegant}.png` (≈400–500 KB each).

### Department selector (commit `04bc8bb`, simplified)
Two pill buttons, no collage, no per-card images.

```jsx
<div className="flex flex-col sm:flex-row gap-4 max-w-md w-full">
  {["Women", "Men"].map((dept) => (
    <button
      key={dept}
      onClick={() => {
        const value = dept.toUpperCase();
        setDepartment(value);
        setStyleIndex(0);
        try { localStorage.setItem("wishi_department", value); } catch {}
        setStep(value === "MEN" ? 3 : 2);
      }}
      className={cn(
        "flex-1 rounded-full border-2 py-6 font-body text-lg font-normal tracking-wide transition-all duration-200",
        department === dept.toUpperCase()
          ? "border-foreground bg-foreground text-background"
          : "border-foreground/80 bg-transparent text-foreground hover:bg-foreground hover:text-background"
      )}
    >
      {dept}
    </button>
  ))}
</div>
```

### Skip body type for men (commit `b7cc1bd`)
Forward: department `onClick` jumps `setStep(value === "MEN" ? 3 : 2)`.
Back: `goBack` adds `if (step === 3 && department === "MEN") { setStep(1); return; }`.

### Style step uses active boards (commit `3bd7440`)
```ts
const activeStyleBoards = department === "MEN" ? menStyleBoards : styleBoards;
```
Title (`Do you like {activeStyleBoards[styleIndex].name} style?`), `<StyleMoodBoard src=... />`, vote handler, counter, and `aria-label` all key off `activeStyleBoards`.

## Rebuild deltas (`wishi-app/src/app/match-quiz/match-quiz-client.tsx`)

1. **Add men's mood-board assets** at `wishi-app/public/img/men-{streetwear,rugged,edgy,cool,elegant}.png` (copy bytes from `smart-spark-craft/src/assets/men-*.png`). Pattern matches existing `/img/style-*.png` convention.

2. **Add `menStyleBoards` array** alongside `styleBoards`:
   ```ts
   const menStyleBoards = [
     { name: "Streetwear", board: "/img/men-streetwear.png" },
     { name: "Rugged",     board: "/img/men-rugged.png" },
     { name: "Edgy",       board: "/img/men-edgy.png" },
     { name: "Cool",       board: "/img/men-cool.png" },
     { name: "Elegant",    board: "/img/men-elegant.png" },
   ] as const;
   ```

3. **Replace department selector** (step 1) with the pill-button block above. Verbatim Loveable className strings.

4. **Delete dead code** after the simplification: `womenImages`, `menImages`, and the `CollageGrid` component definition. They're unreferenced after step 1 changes.

5. **Introduce `activeStyleBoards`** in the component body:
   ```ts
   const activeStyleBoards = department === "MEN" ? menStyleBoards : styleBoards;
   ```
   Use it in: step-3 `<h1>`, `<StyleMoodBoard>` `src` + `name`, `handleStyleVote` (`activeStyleBoards[styleIndex].name` and `.length`), and the vote-button `aria-label`.

6. **Remove the `{styleIndex + 1} / {styleBoards.length} styles` counter.** Loveable does not render this. 1:1 pixel parity means it goes. Keep the submit-state pill (`Saving your answers…` / error) since that's a functional necessity tied to the rebuild's server-action submit path (Loveable opens a SignUp modal, rebuild posts via `submitMatchQuiz` — unavoidable functional divergence, doesn't affect pixel parity in the steady state).

7. **Update `goBack`**:
   ```ts
   const goBack = () => {
     if (step === 0) { router.back(); return; }
     if (step === 3 && department === "MEN") { setStep(1); return; }
     setStep((s) => s - 1);
   };
   ```

8. **Reset `styleIndex` on department change** (Loveable does `setStyleIndex(0)` inside the dept onClick). Without this, switching back from Women → Men mid-flow could leave `styleIndex` at 6 and crash the men's array which only has 5 entries.

9. **Body Type step** — no code change. Routing in (3) makes it unreachable for men; explicit render guard not needed (Loveable doesn't add one).

10. **`finishOnboarding` payload — no change.** `gender_to_style` already maps `MEN → MALE`. `style_direction` reads names from `stylePrefs`, so it'll naturally contain men's style names for men. `body_types` stays empty. `submitMatchQuiz` server action and downstream matcher require zero edits.

## Test plan

### Playwright (`tests/e2e/match-quiz-men.spec.ts`, new)

Per repo convention every behaviour is automated; no manual checkboxes.

- **Men route skips body-type:** open `/match-quiz`, skip Needs, click **Men**, assert progress label is `STYLE` (not `BODY TYPE`) and `4 / 4` (since the visual progress bar still has 4 segments — Loveable keeps the bar the same).
- **Men mood-board order:** assert step-3 title cycles `Streetwear → Rugged → Edgy → Cool → Elegant` in order. Vote `LOVE IT` for Streetwear + Edgy, `NO` for the rest.
- **Back button skips body-type for men:** at step 3, click **Back**, assert progress label is `DEPARTMENT` (not `BODY TYPE`).
- **Submit payload:** intercept the `submitMatchQuiz` server action via DB read after redirect; assert `MatchQuizResult.gender_to_style === "MALE"`, `style_direction` includes `Streetwear` and `Edgy` only, `body_types` is empty.
- **Women route unchanged regression:** existing `/match-quiz` happy path stays green.

### Visual regression

`/match-quiz` is in `tests/visual/marketing.spec.ts`. Department-selector swap will diff. Run `npm run test:visual:update` for `desktop-chrome` (1280×800) + `mobile-chrome` (Pixel 7), commit the new baselines under both `-darwin` and `-linux` suffixes (linux baselines via the `workflow_dispatch update_snapshots=true` GH Actions run, then download the `linux-baselines` artifact and commit — same pattern as the prior Phase 10 sweep).

### Verify chain (per `wishi-app/CLAUDE.md` "definition of done")

1. `npm run typecheck` — clean.
2. `npm run lint` — clean.
3. `npm test` — no new failures.
4. `npm run test:visual` — green after baseline refresh.
5. `npm run e2e -- --grep "match quiz"` — new spec passes; existing women's spec still passes.
6. Price grep gate — n/a (no JSX prices touched).
7. Visual diff vs Loveable Vite dev server (`scripts/diff-all.mjs`) — confirm `/match-quiz` delta stays under the harness threshold.

## Branch + PR

- Branch: `match-quiz-mens-flow` (no phase prefix — production-style name).
- Commits in order: (a) assets + component edits, (b) Playwright spec, (c) refreshed visual baselines.
- PR description: links the seven Loveable commits being mirrored, calls out the visual-baseline refresh, lists the verify chain results inline.

## Risks

- **`font-body` resolution:** verified — both repos map `font-body` → `'DM Sans', sans-serif` in `tailwind.config.ts`. Verbatim className port renders identically.
- **Asset path drift:** Loveable uses webpack-style `import` of `src/assets/*.png` paths; rebuild uses `/img/*.png` from `public/`. Already established for women's boards (`/img/style-*.png`) — same convention applies. Image dimensions and aspect ratio match (`<StyleMoodBoard>` already centers with `max-w-[27rem]`).
- **`styleIndex` overflow** if user toggles Women ↔ Men mid-flow: handled by the `setStyleIndex(0)` reset inside the dept onClick.
- **Visual baseline noise:** the dept-selector simplification touches step 1; existing baselines will fail until refreshed. Expected, not a regression.
