# Loveable Parity Audit — 2026-04-30

Route-by-route audit of every page in `wishi-style/smart-spark-craft` (HEAD = `origin/main`) against the Wishi Next.js app.

## Methodology

- **Sources:** Loveable client repo at `/tmp/smart-spark-craft`, Wishi at `/Users/matthewcardozo/Wishi/wishi-style/wishi-app`.
- **Comparison method:** Structural — `<section>` count, `<h1>`/`<h2>` content + order, key data arrays + CTAs, full file read where divergence was suspected.
- **Locked exceptions** (treated as in-policy, not flagged as drift): Clerk replacing AuthContext / Login/SignUp modals; Server Components + Server Actions over `OrdersContext`; plan prices via `lib/plans.ts#getPlanPricesForUi()`; locked-out copy "2 seasonal capsules" / "free and priority shipping" / "virtual fitting room"; URL renames `/session/:id/room`→`/sessions/[id]/chat` and `/bag`→`/cart`; `/onboarding` redirecting to `/match-quiz`; DB-driven `/style-quiz` reusing the match-quiz shell.
- **Marketing-data exception:** Static editorial content on marketing routes (homepage hero copy, FAQ, press logos, testimonial blocks, gift-card landing, lux landing) is allowed in JSX/CSS/`public/`. Stylists, sessions, looks, reviews, cart, orders are DB-driven.
- **Out of scope:** This audit does NOT propose fixes; it surfaces current state.

## Classifications

- ✅ **VERBATIM** — JSX is a 1:1 port with mechanical Next/Clerk translation only
- ⚠ **PARAPHRASED** — same intent, different structure or copy
- ❌ **MISSING** — page exists but body is empty/placeholder/wrong
- 🔁 **REWRITTEN** — Wishi shipped its own design instead of porting Loveable

## Summary

| # | Route | Loveable file | Class | HIGH | MED | LOW |
|---|---|---|---|---|---|---|
| 1 | `/` | Index.tsx | ✅ VERBATIM | 0 | 0 | 3 |
| 2 | `/home` | (alias) | ✅ VERBATIM | 0 | 0 | 0 |
| 3 | `/how-it-works` | HowItWorks.tsx | ✅ VERBATIM | 0 | 0 | 1 |
| 4 | `/pricing` | Pricing.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 5 | `/lux` | LuxPackage.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 6 | `/gift-cards` | GiftCards.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 7 | `/reviews` | Reviews.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 8 | `/stylists` | Stylists.tsx | ✅ VERBATIM | 0 | 0 | 1 |
| 9 | `/discover` | StylistsDiscover.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 10 | `/stylists/:id` | StylistProfile.tsx | ✅ VERBATIM | 0 | 0 | 1 |
| 11 | `/stylists/:id/reviews` | StylistReviews.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 12 | `/stylist-match` | StylistMatch.tsx | ⚠ PARAPHRASED | 0 | 0 | 1 |
| 13 | `/style-quiz` | StyleQuiz.tsx | ✅ VERBATIM-by-policy | 0 | 0 | 0 |
| 14 | `/select-plan` | SelectPlan.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 15 | `/sessions` | StyleSessions.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 16 | `/sessions/[id]/chat` | StylingRoom.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 17 | `/cart` | MyBag.tsx | ⚠ PARAPHRASED | 0 | 1 | 0 |
| 18 | `/favorites` | Favorites.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 19 | `/orders` | Orders.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 20 | `/profile` | Profile.tsx | ✅ VERBATIM | 0 | 0 | 0 |
| 21 | `/settings` | Settings.tsx | ⚠ PARAPHRASED | 2 | 2 | 1 |
| 22 | `/checkout` | Checkout.tsx | ✅ VERBATIM | 0 | 1 | 1 |
| 23 | `/onboarding` | Onboarding.tsx | ✅ VERBATIM-by-policy | 0 | 0 | 0 |
| 24 | `/session-checkout` | SessionCheckout.tsx | ⚠ PARAPHRASED | 1 | 2 | 1 |
| 25 | `/feed` | Feed.tsx | ⚠ PARAPHRASED | 2 | 2 | 1 |
| 26 | `/board/:boardId` | SharedBoard.tsx | ⚠ PARAPHRASED | 1 | 2 | 1 |

**Roll-up:** 0 MISSING, 0 REWRITTEN, 20 VERBATIM (incl. 2 by-policy), 6 PARAPHRASED.
**Total gaps:** 6 HIGH, 10 MEDIUM, 9 LOW.

The drift is concentrated in 6 routes. Marketing + funnel are essentially clean; the gaps are in `/settings` (StyleInfo + Membership panels), `/feed` (FeedCard structure), `/session-checkout` post-pay state, `/board/:boardId` (StyleBoard component reuse), `/cart` (Sold Out), and `/stylist-match` (semantic wrapper).

---

## 1. `/` — Index.tsx — ✅ VERBATIM

- Loveable: `src/pages/Index.tsx` (602 LOC)
- Wishi: `src/app/page.tsx` (595 LOC) + marketing primitives in `src/components/marketing/` and `src/components/primitives/`
- Same sections in same order: hero collage / press marquee / Meet Our Wishi Stylists bento / How It Works (4-step) / pricing 3-card / #StyledByWishi (desktop grid + mobile carousel) / Concierge banner / Reviews marquee / FAQ accordion / Final CTA. All h1/h2 copy identical.

Gaps:
- LOW — Hero "Let's Get Styling" CTA links to `/match-quiz` (Wishi) vs `/onboarding` (Loveable). Mechanical and equivalent funnel entry, but technically different href.
- LOW — Each grid stylist card links to `/stylists` directory (Wishi) vs `/stylists/{slug}` mock IDs (Loveable). Code comment in Wishi acknowledges deliberate divergence — the mock IDs aren't real DB rows.
- LOW — Reviews are inlined `const reviews` (6 entries) in Wishi vs imported `allReviews` from `@/data/reviews` in Loveable. Same shape; one entry rephrased to avoid blocked copy.

---

## 2. `/home` — alias of `/` — ✅ VERBATIM

- Loveable: aliased in `App.tsx` line 74
- Wishi: `src/app/home/page.tsx` (7 LOC) — `redirect("/")` per locked decision

No gaps.

---

## 3. `/how-it-works` — HowItWorks.tsx — ✅ VERBATIM

- Loveable: `src/pages/HowItWorks.tsx` (329 LOC)
- Wishi: `src/app/how-it-works/page.tsx` (329 LOC, identical line count)
- Same 7 sections: Hero (5-step list + YouTube embed) / What You Receive (6-card features grid) / Build a Wardrobe That Works / Shop the Entire Fashion Market (16-brand chip wall) / Why Wishi Works (Taste/Trust/Time) / Get Styled For (4 occasions) / CTA Closer ("Ready for a wardrobe that actually works?").

Gaps:
- LOW — Hero CTA href `/stylists` for signed-in vs `/onboarding` for guests (Wishi) vs same logic but `/onboarding` for guests in Loveable. Acceptable mechanical translation.

---

## 4. `/pricing` — Pricing.tsx — ✅ VERBATIM

- Loveable: `src/pages/Pricing.tsx` (318 LOC)
- Wishi: `src/app/pricing/page.tsx` (312 LOC)
- 3 sections, same h1/h2 at near-identical line numbers. Plan cards driven by `getPlanPricesForUi()` per locked decision. FAQ + concierge banner identical.

No gaps.

---

## 5. `/lux` — LuxPackage.tsx — ✅ VERBATIM

- Loveable: `src/pages/LuxPackage.tsx` (343 LOC)
- Wishi: `src/app/lux/page.tsx` (496 LOC, larger from Image size props + comments)
- 9 `<section>` tags both sides; same h2 sequence: Start Your Styling Journey / The Styling Process / Chat with us / Buy What You Love / [process detail] / #StyledbyWishi / [process detail] / Your Questions, Answered. All editorial content matches.

No gaps.

---

## 6. `/gift-cards` — GiftCards.tsx — ✅ VERBATIM

- Loveable: `src/pages/GiftCards.tsx` (239 LOC)
- Wishi: `src/app/gift-cards/page.tsx` (333 LOC, larger from Image dimensions + Stripe checkout wiring)
- 5 sections, same h1+h2 in same order. Hero / Choose your card / How it works / Corporate Gifting / FAQ.

No gaps.

---

## 7. `/reviews` — Reviews.tsx — ✅ VERBATIM

- Loveable: `src/pages/Reviews.tsx` (79 LOC)
- Wishi: `src/app/reviews/page.tsx` (98 LOC) + `src/app/reviews/expandable-review-text.tsx`
- Single section. Same h1, same review card chrome with star row + italic quote + author + stylist. Wishi adds the "Read more / Show less" expand toggle for >120-char reviews per recent commit.

No gaps.

---

## 8. `/stylists` — Stylists.tsx — ✅ VERBATIM

- Loveable: `src/pages/Stylists.tsx` (292 LOC)
- Wishi: `src/app/stylists/page.tsx` (Server Component) + `src/app/stylists/stylists-browser.tsx` (client) + `src/app/stylists/what-you-receive-dialog.tsx`
- 2 sections in `StylistsBrowser` mirror Loveable's 2 sections at the same h1/h2 position. Filter chrome + grid mirror Loveable.

Gaps:
- LOW — Componentization differs: Wishi extracts `StylistsBrowser` into a client child of the Server Component page. UX-equivalent.

---

## 9. `/discover` — StylistsDiscover.tsx — ✅ VERBATIM

- Loveable: `src/pages/StylistsDiscover.tsx` (159 LOC)
- Wishi: `src/app/discover/page.tsx` (16+ LOC trimmed in PR #92)
- 3 = 3 `<section>`. Recent commit `fix(discover)` aligned the CTAs.

No gaps.

---

## 10. `/stylists/:id` — StylistProfile.tsx — ✅ VERBATIM

- Loveable: `src/pages/StylistProfile.tsx` (724 LOC — largest funnel page)
- Wishi: `src/app/stylists/[id]/page.tsx` (618 LOC) + `plan-picker.tsx` + `what-you-receive-dialog.tsx`
- 7 = 7 `<section>` count. Hero, signature looks grid, reviews summary + module, PlanPicker (recently added per PR #92), trust section, FAQ. h1/h2 sequence matches.

Gaps:
- LOW — A 724 → 618 LOC delta on a 7-section page warrants a deeper visual diff once a Loveable-vs-Wishi screenshot harness exists. Structural diff is clean, but micro-detail drift (chip ordering, button sizing) is plausible at this scale.

---

## 11. `/stylists/:id/reviews` — StylistReviews.tsx — ✅ VERBATIM

- Loveable: `src/pages/StylistReviews.tsx` (131 LOC)
- Wishi: `src/app/stylists/[id]/reviews/page.tsx` (67 LOC after PR #92 simplification)
- Single-section page. Same h1/h2 + average-rating header + review list shape.

No gaps.

---

## 12. `/stylist-match` — StylistMatch.tsx — ⚠ PARAPHRASED

- Loveable: `src/pages/StylistMatch.tsx` (259 LOC)
- Wishi: `src/app/stylist-match/page.tsx` (174 LOC)
- Loveable: 3 `<section>` (Hero `<section bg-background>` / How It Works / Recommended Stylists). Wishi: 2 `<section>` + a `<div>` wrapper that contains the same "We Found Your Perfect Match" h1 lockup. Recent commit `fix(stylist-match)` added How It Works + recommended-stylists sections.

Gaps:
- LOW — Hero is wrapped in `<div className="min-h-screen bg-background">` instead of `<section>`. Visually identical, semantically different.

Per locked rule, the route 307s to `/sign-in` for guests and `/matches` for authed users, so the JSX body only renders for the brief in-flight case (or when route is hit directly without auth processing). Worth visually verifying the body still renders correctly post-redirect.

---

## 13. `/style-quiz` — StyleQuiz.tsx — ✅ VERBATIM-by-policy

- Loveable: `src/pages/StyleQuiz.tsx` (1017 LOC — hardcoded questionnaire)
- Wishi: `src/app/style-quiz/page.tsx` + `style-quiz-client.tsx` + `actions.ts`
- Per locked decision, Wishi uses the DB-driven match-quiz shell with the seeded `STYLE_PREFERENCE` quiz. Loveable's 1017 lines of hardcoded Q&A is intentionally not ported.

No gaps within scope.

---

## 14. `/select-plan` — SelectPlan.tsx — ✅ VERBATIM

- Loveable: `src/pages/SelectPlan.tsx` (251 LOC)
- Wishi: `src/app/select-plan/page.tsx` (Server Component) + `select-plan-client.tsx`
- Plan cards (Mini/Major/Lux), continue CTA, "Why Wishi" trust block. `?plan=tier` round-trip from `/stylists/[id]` PlanPicker pre-selects via `initialPlan` per recent PR #92 commit.

No gaps.

---

## 15. `/sessions` — StyleSessions.tsx — ✅ VERBATIM

- Loveable: `src/pages/StyleSessions.tsx` (132 LOC)
- Wishi: `src/app/(client)/sessions/page.tsx` + `src/components/session/session-card.tsx`
- 2 = 2 `<section>`. Same h1, same SessionCard composition with hero / status / next-action CTA / open-session button. Recent commit `chore(sessions): point gift-card CTA at internal /gift-cards`.

No gaps.

---

## 16. `/sessions/[id]/chat` — StylingRoom.tsx — ✅ VERBATIM

- Loveable: `src/pages/StylingRoom.tsx` (929 LOC)
- Wishi: `src/app/(client-fullbleed)/sessions/[id]/chat/page.tsx` + `src/components/session/workspace.tsx` + `src/components/chat/chat-window.tsx`
- Full-bleed shell, sidebar, ChatWindow, Workspace right pane all match. Recent verbatim port commit verified parity. Closed-state Session Recap CTA + inquiry-mobile Book button added per PR #92. URL rename per locked decision.

No gaps.

---

## 17. `/cart` — MyBag.tsx — ⚠ PARAPHRASED

- Loveable: `src/pages/MyBag.tsx` (481 LOC)
- Wishi: `src/app/(client)/cart/page.tsx` + `cart-client.tsx`
- Wishi rows / Retailer rows / Add to Closet stub all match. Mechanical translation of `useLocalStorage` cart → DB-backed `CartItem`. URL rename per locked decision.

Gaps:
- MEDIUM — Sold Out section (Loveable lines 353-411) is missing. Documented Phase-11 deferred in `WISHI-REBUILD-PLAN.md` ("/cart Sold Out section — needs availability concept"). Not a surprise drift, but it is drift against the parity contract.

Recommendations h2 ("text-center mb-6" at line 414 Loveable vs line 356 Wishi) is preserved.

---

## 18. `/favorites` — Favorites.tsx — ✅ VERBATIM

- Loveable: `src/pages/Favorites.tsx` (173 LOC)
- Wishi: `src/app/(client)/favorites/page.tsx` + `client.tsx`
- Recent verbatim port commit. Tabs (Items / Stylists), grid layout, empty state.

No gaps.

---

## 19. `/orders` — Orders.tsx — ✅ VERBATIM

- Loveable: `src/pages/Orders.tsx` (358 LOC)
- Wishi: `src/app/(client)/orders/page.tsx` (237 LOC)
- Recent verbatim port commit. Filter chrome, order cards, status badges. The LOC delta is mechanical (Wishi consolidates the Loveable mock arrays into Server Component data loads).

No gaps.

---

## 20. `/profile` — Profile.tsx — ✅ VERBATIM

- Loveable: `src/pages/Profile.tsx` (1223 LOC — largest authed page)
- Wishi: `src/app/(client)/profile/page.tsx` + `client.tsx` + `closet-item-dialog.tsx`
- Recent verbatim port + ClosetItemDialog port. Items toolbar (grid toggle + Select mode), top category strip, mobile chip rows, Looks pill sub-tabs, ClosetItemDialog detail dialog with image/brand/chips/outfits carousel/share-download-edit-delete actions, Looks-tab Stylist filter chip row — all per PR #92.

No gaps.

---

## 21. `/settings` — Settings.tsx — ⚠ PARAPHRASED

- Loveable: `src/pages/Settings.tsx` (675 LOC)
- Wishi: `src/app/(client)/settings/page.tsx` + `personal-info-panel.tsx` + `style-info-panel.tsx` + `edit-password-panel.tsx` + `(client)/settings/deactivate-account-button.tsx` + `actions.ts`
- Hero, 8-card grid, expand-on-click chrome, deactivate dialog all match. Per-panel internals diverge.

Gaps:
- HIGH — `StyleInfoPanel` is read-only with a "Retake style quiz" link. Loveable has full inline edit (~30 fields across 9 sections: occasions, brands, comfort zone, shopping values, IG/Pinterest, free-text notes). Most fields read `EMPTY` because the Wishi schema lacks the Loveable mock columns (occasions, preferredBrands, avoidBrands, comfortZone, shoppingValues, accentuate, necklinesAvoid, bodyAreasMindful, instagram/pinterest in style panel).
- HIGH — `MembershipPanel` swapped for the bespoke `<MembershipCard>` (richer plan-management UI: trial/past-due banners, pause/resume, plan-change dialog). Loveable's flat 3-column grid (Plan / Next billing / Sessions included) + "Change Plan" link + "Cancel Membership" underline + `<CancelMembershipDialog>` are not what's rendered.
- MEDIUM — `LoyaltyRewardsPanel` swapped for `<LoyaltyTierCard>`. Loveable shows avatar + "You don't have a status yet!" headline + literal Bronze/Gold/Platinum bullet lists ("1 Complimentary Mini Session for yourself", "Wishi Styling Kit", Karla Welch perk).
- MEDIUM — Email field is hard-coded `readOnly: true` in `PersonalInfoPanel` (mechanical Clerk concession but not in the locked-exceptions list); Loveable lets users edit email in-place.
- LOW — Avatar UI: Loveable inlines a hover-camera + FileReader data-URL preview; Wishi delegates to `<AvatarUpload>` (presigned-S3 flow). Functional parity but visual chrome differs.

---

## 22. `/checkout` — Checkout.tsx — ✅ VERBATIM

- Loveable: `src/pages/Checkout.tsx` (533 LOC)
- Wishi: `src/app/(client)/checkout/page.tsx` + `checkout-client.tsx`
- Three-step shipping → payment → confirmation, sticky summary sidebar, step indicator, "Add to Closet" post-confirmation card, Mastercard/Visa/Amex logos, lock copy. Mechanical translation from `useLocation().state.items` → `?items=` querystring + Stripe `<PaymentElement>` instead of fake card inputs, allowed by locked exceptions.

Gaps:
- MEDIUM — Empty-state link points to `/cart` (correct per locked redirect) but Loveable says "Return to Bag" linking to `/bag`. Copy preserved; href diverges intentionally.
- LOW — `EmptyState` adds three reason variants (`empty` / `invalid` / `not-direct-sale`) with distinct copy. Additive.

---

## 23. `/onboarding` — Onboarding.tsx — ✅ VERBATIM-by-policy

- Loveable: `src/pages/Onboarding.tsx` (474 LOC — 4-step match-quiz wizard)
- Wishi: `src/app/onboarding/page.tsx` (28 LOC redirect handler)
- Per locked decision, `/onboarding` resumes stylist wizards or 307s clients/guests to `/match-quiz`. The Loveable wizard JSX is ported in `/match-quiz` instead — out of scope for this route audit.

No gaps within scope.

---

## 24. `/session-checkout` — SessionCheckout.tsx — ⚠ PARAPHRASED

- Loveable: `src/pages/SessionCheckout.tsx` (472 LOC)
- Wishi: `src/app/session-checkout/page.tsx` + `session-checkout-client.tsx`
- Back link → stylist hero → frequency toggle → summary + payment column ports verbatim. Stripe-Hosted swap-in for the card form is allowed per locked exceptions.

Gaps:
- HIGH — Loveable's success state ("Meet Daphne, your stylist" with halo portrait + "Your session begins" / "What happens next" journey card + style-quiz CTA) is not implemented. Wishi's `createCheckout` redirects to `/bookings/success` (separate route), so the Loveable success view never renders here. If `/bookings/success` does not mirror that JSX, the success affordance is missing wherever it lives.
- MEDIUM — Saved-card display path (`savedPayment` from localStorage → `•••• 1234` row + "Use a different card" toggle) is gone; Stripe Hosted handles saved cards on its own page.
- MEDIUM — Subscription monthly price uses heuristic `Math.round(oneTimeDollars * 0.9)`; Loveable's `planData` has explicit per-plan monthly numbers (49/117/490). Locked-exception note says "plan prices flow from `getPlanPricesForUi()`" — the heuristic is not the canonical price; comment in code admits "for visual parity only".
- LOW — Loveable always shows the frequency toggle (Mini/Major/Lux); Wishi hides it for Lux per locked one-time-only rule. Acceptable.

---

## 25. `/feed` — Feed.tsx — ⚠ PARAPHRASED

- Loveable: `src/pages/Feed.tsx` (156 LOC) + `src/components/feed/FeedCard.tsx`
- Wishi: `src/app/feed/page.tsx` + `feed-list.tsx`
- Centered "Stylist Looks" header with Womenswear/Menswear pill toggle, single-column 8–12 gap feed, gift-card promo banner after the 3rd post — all match.

Gaps:
- HIGH — Wishi's `FeedCard` is a 2-column grid (look image + product tile column with mobile horizontal scroll + desktop bottom fade). Loveable's `FeedCard` is a single-image card with stylist row, like-toggle, and product-thumbnail click → `<ProductDetailDialog>`. Layout structurally diverges.
- HIGH — Click-product opens an inline `<ProductDetailDialog>` in Loveable; Wishi's `ProductTile` opens an external retailer URL via `<a target="_blank">`. No detail dialog mounted.
- MEDIUM — `<ContactStylistModal>` (Loveable's per-card "Contact" affordance) is replaced with a "book {firstName}" Link to `/select-plan?stylistId=…`. Different surface, different copy.
- MEDIUM — Tabs are pill `<button>` toggles in Loveable (client-side state); Wishi uses `<Link href="?gender=…">` server-roundtripped. Visually equivalent but interaction model differs.
- LOW — Pagination: Wishi adds a "Load more" pill + cursor pagination; Loveable renders all 10 mock posts inline. Additive.

---

## 26. `/board/:boardId` — SharedBoard.tsx — ⚠ PARAPHRASED

- Loveable: `src/pages/SharedBoard.tsx` (131 LOC) — uses `<StyleBoard>` shared component with `defaultProducts` mock + `collageImages`
- Wishi: `src/app/board/[boardId]/page.tsx`
- Stylist attribution row, board title + note, photos grid, items grid, bottom "want X to style you?" CTA + "book {firstName}" pill match. Floating cart bar wired to real `CartItem` count.

Gaps:
- HIGH — Loveable composes the body with `<StyleBoard>` (collage hero + product grid + add-to-cart toggling locally; per `defaultProducts` from `@/components/StyleBoard`). Wishi renders a hand-rolled photos grid + items grid instead. The `StyleBoard` component shape (collage layout, in-component add-to-cart with toast, `hideFeedback` prop) is not ported.
- MEDIUM — Cart-toggle behavior: Loveable's `handleAddToCart` toggles local `cartItems` state with "Removed from bag" / "Added to bag" toasts on each product click. Wishi has no add-to-cart affordance on items at all — board items are display-only `<div>`s.
- MEDIUM — `<StyleBoard>` interactive surface (the canonical "look book" widget Loveable repurposes from the styling-room flow) is the missing component.
- LOW — Stylist name link: Wishi wraps it in `<Link href="/stylists/{profileId}">` (extra affordance not in Loveable). Additive.

---

## Recommended fix priority

By severity (HIGH first):

1. **`/settings` StyleInfoPanel** — HIGH. Schema gap + read-only UI vs Loveable's inline edit. Largest single drift.
2. **`/settings` MembershipPanel** — HIGH. Bespoke `<MembershipCard>` instead of ported Loveable layout. Verify product intent before changing.
3. **`/feed` FeedCard structural divergence** — HIGH. 2-col grid vs single-image with `<ProductDetailDialog>`. Wishi's design may be intentional uplift; confirm before fix.
4. **`/feed` `<ProductDetailDialog>` missing** — HIGH. Inline dialog replaced with external retailer link.
5. **`/session-checkout` "Meet Daphne" success state** — HIGH. Verify whether `/bookings/success` mirrors it; if not, wire it.
6. **`/board/:boardId` `<StyleBoard>` component reuse** — HIGH. Hand-rolled grid instead of shared component with cart toggle.
7. (Phase-11 deferred) **`/cart` Sold Out section** — MEDIUM. Already in `WISHI-REBUILD-PLAN.md` deferred list.
8. Various MEDIUM/LOW gaps in `/settings`, `/checkout`, `/session-checkout`, `/feed`, `/board`.

The HIGH gaps cluster in 4 of 26 routes (`/settings`, `/feed`, `/session-checkout`, `/board/:boardId`). Marketing + funnel + most authed-core routes are clean.

## Audit notes

- Audit is structural + spot-checked. Confidence is high for VERBATIM verdicts (LOC + section count + h1/h2 + recent verbatim port commits all align). Confidence is medium-high for ⚠ PARAPHRASED verdicts on routes where the agent did a deep read (chunk D). Confidence on `/stylists/:id` (724 LOC Loveable) being VERBATIM at the micro-detail level is medium — a screenshot harness is the next step to confirm.
- This audit explicitly does NOT capture micro-styling drift (chip ordering, button px sizing, hover-state differences). The pending `tests/visual/` Loveable-diff harness (planned) is the right level for that.
- The Phase-11 deferreds list in `WISHI-REBUILD-PLAN.md` already captures the Cart Sold Out section, FeedCard inventory enrichment, StyleInfo field-completeness, and a few others called out here. This audit is consistent with that doc; no contradictions.
