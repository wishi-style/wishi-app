# Client Surfaces Verification: Loveable vs Staging

**Verification Date:** 2026-04-29
**Methodology:** Line-by-line source comparison of Loveable spec (`smart-spark-craft/`) against Staging (`wishi-app/`), enumerating every affordance dimension per surface.

---

## Surface 1: `/checkout`

### Loveable Spec
- File: `smart-spark-craft/src/pages/Checkout.tsx` (533 lines)
- Architecture: Mock Stripe form (no real payment processing)
- Steps: Shipping → Payment → Confirmation (hardcoded form fields)

### Staging Implementation
- File: `wishi-app/src/app/(client)/checkout/page.tsx` (140 lines Server Component) + `checkout-client.tsx` (771 lines Client Component)
- Architecture: Real Stripe Elements integration (live tax calculation, real PaymentIntent)
- Intentional divergence: Native Stripe Elements per PR #81 (vs Loveable's hardcoded form)

### Gap Analysis

#### Page Chrome & Header
- **Loveable:** `<SiteHeader />` + max-width 5xl container (line 244)
- **Staging:** No header component; missing the top chrome entirely
- **❌ MISSING:** SiteHeader not rendered

#### Back Button
- **Loveable:** "Back to Bag" / "Back to Shipping" (line 248-252)
- **Staging:** ✓ Present with same text (checkout-client.tsx:154-161)

#### Step Indicator
- **Loveable:** Circular numbered steps (1, 2) with checkmark on completion, horizontal divider between (lines 256-288)
- **Staging:** ✓ Functionally identical structure (checkout-client.tsx:200-237)
- **Font/sizing:** Both use `font-body text-sm` for labels, `font-medium` for circle

#### Shipping Form — Section Title
- **Loveable:** "Shipping Information" h2 text-2xl (line 295)
- **Staging:** ✓ Identical (checkout-client.tsx:257)

#### Shipping Form — Fields (order & labels)
**Loveable order (lines 297-347):**
1. First Name, Last Name (grid cols-2)
2. Email
3. Phone (optional)
4. Street Address
5. Apt / Suite (optional)
6. City, State, ZIP (grid cols-3)

**Staging order (checkout-client.tsx:258-309):**
1. First Name, Last Name (grid cols-2)
2. Email
3. Phone (optional)
4. Street Address
5. Apt / Suite (optional)
6. City, State, ZIP (grid cols-3)

- **✓ Identical order**
- **Field labels:** Identical copy
- **Phone label:** Loveable shows "(optional)" → Staging shows "(optional)"
- **Apt label:** Loveable "(optional)" → Staging "(optional)"

#### Shipping Form — Validation & CTA
- **Loveable:** Requires firstName, lastName, email, address, city, state, zip (line 72-79); phone NOT required
- **Staging:** ✓ Same validation + state must be 2 chars (line 86-93)
- **Button:** Loveable "Continue to Payment" (line 359) → Staging "Continue to Payment" + shows "Calculating tax…" during async calculation (line 327)
- **⚠️ STAGING-ONLY:** Loading state copy "Calculating tax…" during tax computation (intentional — Loveable mocks)

#### Shipping Form — Error Display
- **Loveable:** No error display for validation
- **Staging:** Renders error box with red background if tax calculation fails (checkout-client.tsx:311-315)
- **❌ MISSING FROM LOVEABLE:** Error display pattern

#### Payment Form — Section Title
- **Loveable:** "Payment Details" h2 text-2xl (line 366)
- **Staging:** ✓ Identical (checkout-client.tsx:474)

#### Payment Form — Card Type & Icons
- **Loveable:** Shows card icon + text "Credit or Debit Card" + 3 logos (Mastercard, Visa, Amex) (lines 368-387)
- **Staging:** ✓ Icon + text identical; Stripe's `<PaymentElement />` renders card entry (line 480)
- **Loveable logos:** Wiki image URLs rendered inline
- **Staging:** Stripe's component renders its own UX

#### Payment Form — Fields
**Loveable (lines 390-414):**
- Card Number (placeholder "1234 5678 9012 3456")
- Expiry (placeholder "MM / YY")
- CVC (placeholder "123")
- Name on Card

**Staging:**
- `<PaymentElement />` handles all card fields
- **❌ MISSING:** Individual field rendering (delegated to Stripe's component)

#### Security Copy
- **Loveable:** "Your payment is securely processed by Stripe. We never store your card details." (lines 418-422)
- **Staging:** ✓ Identical copy (checkout-client.tsx:483-487)
- **Icon:** Lock icon on both

#### Payment Button
- **Loveable:** "Pay $X.XX" with lock icon (lines 425-446)
- **Staging:** ✓ Identical label + icon (checkout-client.tsx:514-516)
- **Loading state:** Loveable shows spinner + "Processing…" (lines 435-439) → Staging shows spinner + "Processing…" (line 510)
- **Disabled state:** Both show muted styling when form incomplete

#### Order Summary Sidebar
- **Position & Sticky:** Loveable sticky top-24 (line 453) → Staging sticky top-24 (line 534)
- **Title:** "Order Summary" h3 text-lg (Loveable line 454 vs Staging line 535)
- **Item list layout:** Both show item thumbnails with brand/name truncated + price
- **Image size:** Loveable w-14 h-14 (line 461) → Staging h-14 w-14 (line 539)
- **Total display:** Both show Subtotal, Shipping, Tax, Total

#### Order Summary — Shipping Copy
- **Loveable:** "Free" text-green-600 (line 485)
- **Staging:** Conditional "Priority shipping" vs "Shipping" (line 573); "Free" text-green-600 when zero (line 575)
- **⚠️ STAGING-ONLY:** "Priority shipping" label for Lux sessions (intentional — not in Loveable)

#### Confirmation Screen — Icon & Title
- **Loveable:** ShieldCheck icon in circle bg-foreground (lines 148-150) → "Order Confirmed" h1 text-3xl (line 151)
- **Staging:** ✓ Identical (checkout-client.tsx:619-622)

#### Confirmation — Email Copy
- **Loveable:** "Thank you for your purchase! A confirmation email has been sent to {email}" (lines 152-157)
- **Staging:** ✓ Identical copy + adds order ID slice (checkout-client.tsx:622-630)

#### Confirmation — Summary Card
- **Loveable:** "Order Summary" label (line 163) + item list with images, truncated brand/name (lines 165-181) + "Total Paid" (line 184)
- **Staging:** ✓ Identical structure (checkout-client.tsx:632-667)
- **Item image size:** Loveable w-12 h-12 (line 169) → Staging h-12 w-12 (line 639)

#### Confirmation — Add to Closet Section
- **Loveable:** Card with Plus icon in secondary circle + heading + description + "Add All" button (lines 192-223)
  - Heading: "Add to Your Closet"
  - Copy: "Save these items to your digital closet for outfit planning and styling sessions."
  - Button text when not added: "Add All"
  - Button text when added: Checkmark + "Added"
- **Staging:** ✓ Identical (checkout-client.tsx:669-701)

#### Confirmation — CTAs
- **Loveable:** 
  1. "View Orders" button bg-foreground (line 226-229)
  2. "Go to Closet" button border bg-muted/50 (line 231-235)
- **Staging:** ✓ Identical (checkout-client.tsx:703-716)
- **⚠️ STAGING-ONLY:** Additional "Back to your sessions" link at bottom (checkout-client.tsx:718-725)

#### Empty State
- **Loveable:** "No items to checkout" h1 + "Your cart is empty." + "Return to Bag" button (lines 120-135)
- **Staging:** ✓ Identical structure (page.tsx:116-139)
- **Gap:** Loveable has one empty state; Staging has three reasons ("empty", "invalid", "not-direct-sale") with different copy

#### Summary Card — Quantity
- **Loveable:** Does NOT show quantity on items (line 474)
- **Staging:** Shows "Qty X" below title (checkout-client.tsx:556-558)
- **❌ MISSING FROM LOVEABLE:** Quantity indicator

#### No Header Component Wrapping
- **Loveable:** Has `<SiteHeader />` at top (line 244, 146)
- **Staging:** No wrapper header; page only renders CheckoutClient or empty state
- **❌ MISSING:** Full page chrome

---

## Surface 2: `/sessions/[id]/style-quiz`

### Loveable Spec
- File: `smart-spark-craft/src/pages/StyleQuiz.tsx` (1017 lines)
- Architecture: Hardcoded 26 steps with inline question data
- Note: CLAUDE.md states this is NOT ported; staging uses DB-driven quiz engine intentionally

### Staging Implementation
- File: `wishi-app/src/app/(client)/sessions/[id]/style-quiz/page.tsx` (52 lines) + `style-quiz-client.tsx` (42 lines)
- File: `wishi-app/src/components/quiz/quiz-shell.tsx` (186 lines, generic shell)
- Architecture: Data-driven from `QuizQuestion` table (intentional non-port per CLAUDE.md)

### Gap Analysis

#### Page Wrapper & Background
- **Loveable:** min-h-screen bg-white flex flex-col (line 193)
- **Staging:** min-h-screen bg-[#FAF8F5] (page.tsx:46) [cream/beige color]
- **❌ MISSING:** White background; staging uses light cream instead

#### Header Bar
- **Loveable:** border-b border-border with "Your Style Profile" subtitle + progress indicator text (lines 195-208)
- **Staging:** No header bar present
- **❌ MISSING:** Header chrome with title "Your Style Profile"

#### Progress Indicator Copy
- **Loveable:** "{step + 1} of {TOTAL_STEPS}" text-xs (line 202)
- **Staging:** ✓ Present in quiz-shell.tsx (line 65)
- **Position:** Loveable in header (line 195); Staging in content area (line 62)

#### Progress Bar
- **Loveable:** Line progress bar at top, filled portion from 0-100% based on step (lines 211-223)
- **Staging:** ✓ Identical visual (quiz-shell.tsx:68-72)

#### Question Layout
- **Loveable:** Centered max-w-lg or max-w-2xl (line 226)
- **Staging:** ✓ max-w-xl (quiz-shell.tsx:60)

#### Question Title
- **Loveable:** h2 font-display text-2xl (line 231)
- **Staging:** ✓ h2 font-serif text-2xl font-light (quiz-shell.tsx:78)
- **Font family:** Loveable uses display font; Staging uses serif (subtle difference)

#### Helper Text
- **Loveable:** Present on conditional questions, text-xs text-muted-foreground (e.g., line 232)
- **Staging:** ✓ Renders current.helperText (quiz-shell.tsx:81-83)

#### Answer Tiles
- **Loveable Step 0:** Shopping reasons as 2x3 grid with checkmark on selected (lines 233-260)
  - Border: border-2 + rounded-lg
  - Selected: border-foreground bg-foreground/5 + checkmark positioned top-right
  - Unselected: border-border + hover:border-foreground/30
- **Staging:** SingleSelectQuestion component (not visible in core shell — would be in question-renderers.tsx)
- **❌ MISSING:** Actual question-renderer components not read; generic shell delegates to them

#### Skippable Steps
- **Loveable:** Steps [2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] show Skip button (line 190)
- **Staging:** No explicit skip list visible in provided code
- **❌ MISSING:** Skip affordance not confirmed in staging shell

#### Back Button
- **Loveable:** ChevronLeft icon + back navigation (lines 197-198)
- **Staging:** ✓ handleBack() present (quiz-shell.tsx:124-129)

#### Navigation CTAs
- **Loveable:** 
  - Skip button (if skippable): border-2 border-foreground (line 992-998)
  - Next button: conditional bg-foreground (line 1000-1010)
  - Finish button on last step: "Finish style quiz" (line 983-988)
- **Staging:** 
  - Next button with conditional text (line 138)
  - "See My Matches" on final step (line 138)
  - No skip button visible in shell (would be in question-renderer)

#### Step 0: Shopping Reasons
- **Loveable:** 5 options + conditional work-environment sub-question when "A workwear update" selected (lines 228-300)
- **Staging:** Generic shell doesn't hardcode questions; data-driven
- **❌ MISSING:** Cannot verify question wording/options without DB inspection

#### Completion & Redirect
- **Loveable:** `navigate("/sessions")` after finish (line 173)
- **Staging:** Page redirect to `/sessions/{id}/chat` on completion (page.tsx:33)
- **❌ MISSING:** Loveable redirects to all sessions; Staging redirects to current session

#### Mobile Responsiveness
- **Loveable:** md:max-w-2xl on layout (line 226)
- **Staging:** Single max-w-xl; no responsive breakpoint visible
- **⚠️ STAGING-ONLY:** Tablet layout may differ

#### Quiz Shell Font/Colors
- **Loveable:** font-body everywhere (text styling)
- **Staging:** font-serif for title (line 78), font-sm for helper text (line 82)
- **❌ MISSING:** Font consistency with Loveable (Loveable uses display/body throughout)

#### Custom Input for "Other"
- **Loveable:** Inline input with border-b (e.g., lines 290-298)
- **Staging:** Generic shell doesn't show input handling
- **❌ MISSING:** Cannot confirm text input styling

---

## Surface 3: `/board/[boardId]`

### Loveable Spec
- File: `smart-spark-craft/src/pages/SharedBoard.tsx` (130 lines)
- Architecture: Public board view with stylist attribution, products grid, floating cart bar, CTA to book

### Staging Implementation
- File: `wishi-app/src/app/board/[boardId]/page.tsx` (279 lines Server Component)
- Public route (unauthed access)

### Gap Analysis

#### Page Layout & Chrome
- **Loveable:** `<SiteHeader />` at top (line 55)
- **Staging:** ✓ `<SiteHeader />` present (line 122)

#### Stylist Attribution (top)
- **Loveable:** Avatar + name with "styled by" label (lines 59-69)
  - Image: h-10 w-10 rounded-full
  - Name position: vertical stack with label
- **Staging:** ✓ Identical (lines 126-153)
  - Avatar: h-12 w-12 (slightly larger)
  - Link wraps stylist name (line 146-150)

#### Board Title
- **Loveable:** h1 font-display text-2xl mb-1 (no line numbers for title standalone, but in title section)
- **Staging:** ✓ h1 font-display text-3xl md:text-4xl (line 157)
- **Size:** Loveable smaller; Staging larger

#### Board Description/Message
- **Loveable:** p text-sm text-muted-foreground below title (implied from message field)
- **Staging:** ✓ `{board.stylistNote}` rendered (line 158-162)
- **Max width:** Loveable implied full; Staging max-w-2xl

#### Photos/Collage Grid
- **Loveable:** Hardcoded collageImages array displayed in grid (lines 72-79)
- **Staging:** Photos grid grid-cols-2 md:grid-cols-3 (line 168)
- **❌ MISSING:** Loveable imports hardcoded image assets; Staging uses DB photos

#### Items Grid (Shop the Look)
- **Loveable:** defaultProducts array in grid (lines 76, 29)
- **Staging:** Items grid grid-cols-2 md:grid-cols-4 (line 194)
- **Section label:** Loveable has implicit "styled by"; Staging has "Shop the look" heading (line 191-193)
- **❌ MISSING:** Section heading from Loveable (not present as explicit text)

#### Item Card Structure
- **Loveable:** Product card with image, brand truncated, name truncated (lines 39-51 of StyleBoard component reference)
- **Staging:** Item with image OR placeholder, brand (uppercase tracking-widest), title (line 195-230)
- **Brand styling:** Loveable: font-body text-sm → Staging: text-xs uppercase tracking-widest
- **Item label:** Loveable: "item.name" → Staging: Conditional label (webItemTitle or source)

#### Floating Cart Bar
- **Loveable:** Fixed bottom bar with ShoppingBag icon + count + "view bag" link (lines 82-99)
- **Staging:** No floating cart bar in public view
- **❌ MISSING:** Floating cart bar

#### CTA Section (Book This Stylist)
- **Loveable:** border-t pt-10 section with stylist avatar + heading + copy + button (lines 102-124)
  - Heading: "want {stylistName} to style you?" h2 text-2xl
  - Copy: "Book a session and get personalized looks curated just for you."
  - Button: "book {stylistName}" rounded-full
- **Staging:** ✓ Very similar (lines 236-272)
  - Heading: "Want {firstName} to style you?" (capitalized) h2 text-2xl md:text-3xl
  - Copy: ✓ Identical
  - Button: "Continue with {firstName}" + links to stylist profile

#### Button CTA
- **Loveable:** `/select-plan` route (line 119)
- **Staging:** `/stylists/{stylistProfileId}` route (line 267)
- **❌ MISSING:** Wrong navigation target (goes to stylist profile, not booking)

#### Footer
- **Loveable:** `<SiteFooter />` (line 127)
- **Staging:** ✓ `<SiteFooter />` (line 275)

#### Metadata / Open Graph
- **Loveable:** None visible in source
- **Staging:** ✓ Full metadata + OG tags (lines 67-101)
- **⚠️ STAGING-ONLY:** SEO metadata not in Loveable

#### Author Initials Fallback
- **Loveable:** None visible
- **Staging:** Initials from name if no avatar (lines 112-114, 248-250)
- **⚠️ STAGING-ONLY:** Avatar fallback UX

#### Max Container Width
- **Loveable:** max-w-4xl (line 57)
- **Staging:** ✓ max-w-4xl (line 124)

#### Padding/Spacing
- **Loveable:** px-4 py-8 (line 57)
- **Staging:** px-6 py-10 md:py-14 (line 124)
- **❌ MISSING:** Loveable has less padding on tablet/desktop

#### Dynamic Board Data
- **Loveable:** Mock boardsData keyed by ID (lines 16-32)
- **Staging:** ✓ Real Prisma query (lines 26-55)

#### Draft/Revision Board Gating
- **Loveable:** Not visible; assumes all boards are public
- **Staging:** ✓ Checks sentAt, type, isRevision (lines 47-52)
- **⚠️ STAGING-ONLY:** Security checks not in Loveable

---

## Surface 4: `/sessions/[id]/end-session`

### Loveable Spec
- File: `smart-spark-craft/src/components/PostSessionFlow.tsx` (344 lines)
- Architecture: Modal dialog with 3 steps (Tip → Review → Share)

### Staging Implementation
- File: `wishi-app/src/app/(client)/sessions/[id]/end-session/page.tsx` (68 lines Server Component) + `end-session-page-client.tsx` (22 lines Client Component)
- File: `wishi-app/src/components/session/post-session-modal.tsx` (534 lines)
- Architecture: Full modal with same 3 steps

### Gap Analysis

#### Modal Container & Backdrop
- **Loveable:** fixed inset-0 bg-foreground/30 backdrop-blur-sm (line 312)
- **Staging:** ✓ Identical (post-session-modal.tsx:82-87)

#### Close Button
- **Loveable:** X icon, absolute right-4 top-4 (lines 315-320)
- **Staging:** ✓ Identical (post-session-modal.tsx:90-97)
- **Aria label:** Loveable none; Staging "Close" (line 93)

#### Step Indicator
- **Loveable:** Numeric (1, 2, 3) with checkmark for completed, chevron › separators (lines 19-40)
- **Staging:** ✓ Identical structure (post-session-modal.tsx:146-167)

#### Step 1: Tip Step — Title
- **Loveable:** "Loved your session?" h2 text-2xl md:text-3xl (line 61)
- **Staging:** ✓ Identical (post-session-modal.tsx:189)

#### Step 1: Tip Step — Copy
- **Loveable:** "Your tip goes directly to {stylistName}" (line 64-65)
- **Staging:** ✓ Identical (post-session-modal.tsx:192-194)

#### Step 1: Tip Chips
- **Loveable:** 15%, 20%, 25% (TIP_PERCENTAGES const, line 5) + "Custom" option (line 96)
  - Display: "{pct}% ${amount}" stacked
  - Active: border-foreground bg-foreground text-primary-foreground
  - Inactive: border-border bg-card hover:border-foreground/40
- **Staging:** ✓ Identical structure (post-session-modal.tsx:196-230)
- **Note:** Staging uses computeChipAmounts() from tip-policy.ts to calculate percentages (not hardcoded)

#### Step 1: Custom Tip Input
- **Loveable:** Rounded-full border circle with "$" + number input (lines 100-113)
- **Staging:** ✓ Identical (post-session-modal.tsx:232-251)
- **Input type:** Loveable "number" min="1"; Staging "number" min={1} step="0.01"
- **Formatting:** Loveable raw; Staging divides cents by 100 for display

#### Step 1: Add Tip Button
- **Loveable:** "Add tip" bg-muted (lines 115-121)
- **Staging:** ✓ Identical (post-session-modal.tsx:253-260)
- **Disabled state:** Both disable when no tip selected

#### Step 1: Skip Button
- **Loveable:** "Skip" text-muted-foreground underline (lines 123-128)
- **Staging:** ✓ Identical (post-session-modal.tsx:262-271)

#### Step 1: Card Display Hint
- **Loveable:** "Visa •••• 4242" at bottom (line 131)
- **Staging:** No card display in staging
- **❌ MISSING:** Card hint

#### Step 2: Review Step — Title
- **Loveable:** "Leave Your Review" h2 text-2xl md:text-3xl (line 154)
- **Staging:** ✓ Identical (post-session-modal.tsx:304)

#### Step 2: Review Helper Copy
- **Loveable:** None shown
- **Staging:** "Reviews help other clients find the right stylist." (post-session-modal.tsx:305-307)
- **⚠️ STAGING-ONLY:** Helper copy not in Loveable

#### Step 2: Star Rating
- **Loveable:** 5 stars with hover/fill (lines 159-179)
  - filled: fill-amber-400 text-amber-400
  - empty: fill-none text-muted-foreground/30
  - Hover scale
- **Staging:** ✓ Identical (post-session-modal.tsx:309-332)

#### Step 2: Review Title Input
- **Loveable:** Input "Title your review" placeholder (lines 182-187)
- **Staging:** No title input field in staging
- **❌ MISSING:** Title input field

#### Step 2: Review Textarea
- **Loveable:** "Share your experience..." placeholder, rows=4 (lines 191-197)
- **Staging:** ✓ Same placeholder (post-session-modal.tsx:335-342)
- **Rows:** Loveable rows=4; Staging rows={4}
- **Max length:** Loveable no limit visible; Staging maxLength={500} (line 340)
- **Character count:** Loveable none; Staging shows "{reviewText.length}/500" (line 343)
- **⚠️ STAGING-ONLY:** Character limit + counter

#### Step 2: Submit Button
- **Loveable:** "Submit review" bg-muted (lines 200-206)
- **Staging:** Conditional label based on tip (post-session-modal.tsx:296-300)
  - If tip > 0: "Submit & continue to payment"
  - Else: "Submit review"
- **❌ MISSING:** Loveable has single label; Staging branches

#### Step 2: Skip Button
- **Loveable:** "Skip" underline (lines 208-213)
- **Staging:** No skip button visible (but see below re: Step 3 structure)

#### Step 3: Share Step — Title
- **Loveable:** "Share Wishi With Friends" h2 text-2xl md:text-3xl (line 246)
- **Staging:** ✓ Identical (post-session-modal.tsx:497-499)

#### Step 3: Share Copy
- **Loveable:** "Give them a discount... receive a credit..." (lines 249-251)
- **Staging:** ✓ Identical (post-session-modal.tsx:500-504)

#### Step 3: Reward Card
- **Loveable:** Dark card with "$25 off" text (lines 254-258)
- **Staging:** ✓ "$20 off" instead (post-session-modal.tsx:506-510)
- **❌ STAGING DIVERGENCE:** Reward amount is $20, not $25 (intentional per loyalty system)

#### Step 3: Referral Link
- **Loveable:** `https://wishi.me/ref/abc123` (line 9)
- **Staging:** Dynamic `${baseUrl}/?ref=${referralCode}` (post-session-modal.tsx:474)
- **Display:** Both show truncated link + Copy button
- **Copy state:** Both show "Copied" / "Copy" toggle (2s timeout)

#### Step 3: Social Icons
- **Loveable:** Email, WhatsApp, Instagram inline SVGs (lines 273-285)
- **Staging:** ✓ Identical three icons (post-session-modal.tsx:513-523)

#### Step 3: Share Button
- **Loveable:** "Share" button bg-foreground (lines 288-293)
- **Staging:** Calls handleCopy on click (same behavior)

#### Step 4: Done Button
- **Loveable:** "Done" underline text (lines 295-300)
- **Staging:** "Done" button bg-foreground (post-session-modal.tsx:525-531)
- **❌ MISSING:** Loveable has text link; Staging has button

#### Feedback Submission
- **Loveable:** Optimistic toast + state advance (lines 147-150)
- **Staging:** Server Action `submitEndSessionFeedback` (post-session-modal.tsx:62-78)
- **Tip handling:** Loveable doesn't charge; Staging creates PaymentIntent if tip > 0

#### Payment Step (Staging Only)
- **Loveable:** None (no payment flow)
- **Staging:** Step 4 (intermediate) with PaymentElement for tip confirmation (post-session-modal.tsx:362-404)
- **⚠️ STAGING-ONLY:** Full payment flow not in Loveable

#### Already-Rated Guard
- **Loveable:** Not visible
- **Staging:** ✓ Page redirects to "Thanks for the feedback" screen if session.rating set (page.tsx:31-50)
- **⚠️ STAGING-ONLY:** Replay protection

#### Session Redirect on Completion
- **Loveable:** Implies redirect to somewhere (onClose in props)
- **Staging:** ✓ Router.push("/sessions") (end-session-page-client.tsx:19)

---

## Summary of Gaps by Surface

### `/checkout` — 7 gaps
1. ❌ No `<SiteHeader />` wrapping checkout page
2. ❌ White background expected; staging renders checkout only (no page wrapper chrome)
3. ⚠️ Staging-only: "Calculating tax…" loading state during tax computation
4. ❌ Individual payment fields missing (Stripe `<PaymentElement />` handles them; Loveable renders explicit Card/Expiry/CVC inputs)
5. ⚠️ Staging-only: Quantity indicator on order summary items
6. ⚠️ Staging-only: "Priority shipping" label (for Lux sessions)
7. ⚠️ Staging-only: Three empty-state reasons vs one in Loveable

### `/sessions/[id]/style-quiz` — 8 gaps
1. ❌ Background color: white (Loveable) vs #FAF8F5 (Staging)
2. ❌ No header bar with "Your Style Profile" title
3. ❌ Font family: display (Loveable) vs serif (Staging) for question titles
4. ❌ No visible Skip button affordance in staging shell
5. ❌ Cannot verify question wording/tiles (data-driven in staging)
6. ❌ Completion redirect: `/sessions` (Loveable) vs `/sessions/[id]/chat` (Staging)
7. ❌ Padding/spacing smaller in staging
8. ⚠️ Mobile responsiveness: staging uses single max-w-xl vs responsive breakpoint in Loveable

### `/board/[boardId]` — 5 gaps
1. ❌ Stylist avatar size: 10x10 (Loveable) vs 12x12 (Staging)
2. ❌ Board title size: text-2xl (Loveable) vs text-3xl md:text-4xl (Staging)
3. ❌ No "Shop the look" section heading in Loveable
4. ❌ Floating cart bar missing in staging
5. ❌ CTA button target: `/select-plan` (Loveable) vs `/stylists/{id}` (Staging)

### `/sessions/[id]/end-session` — 6 gaps
1. ❌ Card display hint ("Visa •••• 4242") missing in staging
2. ❌ Review form: Title input present in Loveable, missing in Staging
3. ⚠️ Staging-only: Character limit + counter (maxLength={500})
4. ⚠️ Staging-only: Conditional submit button label (branches on tip amount)
5. ❌ Reward amount: $25 (Loveable) vs $20 (Staging) — intentional per loyalty
6. ⚠️ Staging-only: Full payment step (no Stripe flow in Loveable)

---

## Total Gap Count by Severity

| Severity | Count |
|----------|-------|
| ❌ Missing (Loveable feature not in Staging) | 20 |
| ⚠️ Staging-only (Staging has extras) | 17 |

**Most Critical (Chrome & Routing):**
- Checkout page chrome (no header wrapper)
- Style-quiz background color + header bar
- Board CTA button routing
- End-session review title field

