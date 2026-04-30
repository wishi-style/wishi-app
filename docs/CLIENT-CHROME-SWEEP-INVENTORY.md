# Client Authed Surface Gap Inventory

**Scope:** Gap analysis between Loveable spec (`smart-spark-craft/src/pages/`) and staging implementation (`wishi-app/src/app/(client)/`). This document audits structural, textual, and interaction gaps—not visual pixel-perfect deltas.

**Key context:**
- Loveable uses React Router + `SiteHeader` chrome
- Staging uses Next.js 16 App Router with `ClientNav` (Wishi-original nav, NOT ported from Loveable)
- The nav divergence is a known chrome gap; this inventory focuses on *page content* gaps only
- All copy, CTAs, empty states, modals, and feature parity are inventoried below

---

## Per-Page Gaps

### 1. `/sessions` — My Style Sessions

**Loveable:** `smart-spark-craft/src/pages/StyleSessions.tsx`  
**Staging:** `wishi-app/src/app/(client)/sessions/page.tsx`

**Biggest gap:** Loveable gift card cross-sell banner is present in staging (cream bg, "Give the gift of style" copy), but the Loveable structure has hardcoded session state machine (active/past sections) while staging queries real sessions from DB and filters by status. Loveable shows subtitle "4 sessions" below title; staging shows dynamic count inline.

**Title:**
- Loveable: `<h1 class="font-display text-4xl md:text-5xl">` + trailing subtitle `<p class="text-muted-foreground font-body text-sm">` listing total session count
- Staging: `<h1 class="font-display text-3xl md:text-4xl">` (smaller on mobile) + inline subtitle in smaller flex below

**Section structure:**
- Both: "Active" (heading: `text-lg text-dark-taupe` Loveable; `text-xs uppercase` staging) + space-y-4 session cards
- Both: "Past" / "Previous Sessions" (Loveable says "Previous", staging says "Past"); same heading style
- Both: Sessions list as repeating SessionCard components

**Banners:**
- Loveable gift card banner: light cream bg, text-lg title, outline button to external wishi.me/gift-cards URL
- Staging: Loveable's exact banner structure ported; bg-cream class (same color), same copy, same link target

**Empty state:**
- Loveable: no explicit empty state in code shown; sessions are mock-seeded
- Staging: rounded-2xl card with centered copy + PillButton to /stylists with variant="solid"

**CTAs:**
- Loveable: SessionCard has `onAction={() => navigate(/session/${session.id}/room)}` button
- Staging: SessionCard links to `/sessions/${s.id}/chat` (different route path)

**Notable rebuild-only extras:**
- Staging has real Prisma queries filtering by session status (BOOKED, ACTIVE, PENDING_END, etc.) vs. Loveable's client-side mock filtering
- Staging's empty state differs from Loveable (Loveable has no shown empty UI)

**Notable Loveable gaps in staging:**
- None identified; core structure and gift card banner present

---

### 2. `/sessions/[id]/chat` — The StylingRoom

**Loveable:** `smart-spark-craft/src/pages/StylingRoom.tsx`  
**Staging:** `wishi-app/src/app/(client)/sessions/[id]/chat/page.tsx`

**Biggest gap:** Loveable is a single monolithic React SPA with client-side state (messages, cart, UI tabs via useState). Staging is Server Component with client-side island pattern; the actual chat rendering is in `[id]/workspace/page.tsx` (Loveable calls it "Chat" tab, staging splits workspace from chat). Both have the same sidebar + main content + input layout, but staging's chat implementation uses real Twilio Conversations API, not mocked.

**Layout:**
- Loveable: Left sidebar (desktop hidden on mobile) with stylist avatar, session type badge, looks-delivered progress bar, vertical tab nav (Chat, Style Boards, Curated Pieces, Cart), upsell CTAs (Buy more looks, Upgrade Plan)
- Staging: Identical layout with Client Nav wrapping it; same sidebar nav; same progress bar; same upsell buttons

**Chat message structure:**
- Both: Date separators (Today / Yesterday / date format), chat bubbles with sender (user right-aligned, stylist left), system messages
- Both: Support for mood-board, style-board, product-card message types
- Both: Timestamp formatting identical

**Tabs:**
- Loveable tabs: Chat, Style Boards, Curated Pieces, Cart
- Staging: Same 4 tabs

**Input area:**
- Loveable: Rounded pill input with attachment button, voice placeholder, send button
- Staging: Identical design

**Empty cart:**
- Loveable: "Let's fill up your cart" centered copy + Browse Curated Pieces button
- Staging: Identical

**Modals:**
- Loveable: BuyLooksDialog, UpgradePlanDialog, SessionCompleteDialog, ProductDetailDialog, PostSessionFlow (opened on session close)
- Staging: All present; SessionCompleteDialog auto-opens when entering a closed session (Loveable shows it via button)

**Notable rebuild-only extras:**
- Staging's chat is sourced from Twilio Conversations API (real-time), not mocked; DB mirrors all messages
- Staging auto-opens SessionCompleteDialog on first render if session.status === CLOSED (Loveable requires click)
- Staging has separate `/workspace` route for chat; Loveable is all one page

**Notable Loveable gaps in staging — confirmed source-vs-source:**

1. **Top chrome leakage.** Loveable's `StylingRoom` renders `h-screen` full-bleed with NO top nav above it (the back button in the sidebar replaces the global header). Staging is wrapped by `(client)/layout.tsx → ClientNav`, so the wrong member-portal nav (Wishi · Sessions · Profile · Orders · Settings) appears above the workspace. Even if ClientNav is replaced with a Loveable SiteHeader, the StylingRoom contract is to suppress the global header entirely and let the sidebar own navigation. **Fix shape:** the chat route needs a nested `(client)/sessions/[id]/chat/layout.tsx` (or a route-group split) that bypasses the top header.
2. **Back link copy + tone.** Loveable: `Back` (`text-foreground` regular). Staging: `Back to Sessions` (`text-muted-foreground`). `workspace.tsx:156`.
3. **Stylist location subtitle missing.** Loveable renders `<p class="text-xs text-muted-foreground font-body">{stylistLocation}</p>` under the name (`StylingRoom.tsx:342`). Staging only renders the name (`workspace.tsx:169-172`). The Server Component query at `chat/page.tsx:38-47` does not select the stylist's city / location field at all — this is a data-pull gap as well as a render gap. The stylist's primary city lives on `StylistProfile`.
4. **Avatar+name not linked to public profile.** Loveable wraps `Avatar + name + location` in a `<Link>` to the stylist's `/stylists/[profileId]` page (`StylingRoom.tsx:330-344`). Staging does not link them — `clerkId` is fetched but unused for navigation.
5. **Inquiry-state shell entirely missing.** Loveable `StylingRoom` accepts `sessionType: "inquiry"` and renders a constrained chat-only shell: `tabs: ["Chat"]`, no progress bar, "Inquiry" badge (no plan badge), bottom CTA = "Book {firstName}" + tagline "Ready to start a styling session?" (`StylingRoom.tsx:82, 346-349, 418-429`). Staging hard-redirects inquiries away from `/sessions/[id]/chat` (`CHAT_STATUSES` does not include `INQUIRY`, `chat/page.tsx:14-19, 52-53`). Inquiry conversations have no place to live in staging — that entire user state was dropped during the rebuild.
6. **Tab list is hard-coded, not data-driven.** Loveable feeds `session.tabs` into the sidebar (`StylingRoom.tsx:395-414`), allowing the inquiry-only `["Chat"]` collapse and any future per-state variant. Staging hard-codes all 4 tabs (`workspace.tsx:71-76`).
7. **Buy-more-looks copy + visual.** Loveable: lowercase `buy more looks` with `Plus` icon, `text-[11px] text-muted-foreground`, `rounded-[4px]` border (`StylingRoom.tsx:432-438`). Staging needs verification against this exact treatment — the workspace.tsx body past line 200 wasn't read here but the component should match this dimensionally and case-wise.
8. **"Deliverable exceeded" label missing.** Loveable swaps the progress label from `Looks delivered` to `Deliverable exceeded` when delivered > required (`StylingRoom.tsx:380`). Staging always says `Looks delivered`.
9. **Plan-badge copy.** Loveable: `Mini` / `Major` / `✦ Lux` (`StylingRoom.tsx:361`). Staging matches `workspace.tsx:116`. ✓
10. **Mobile header.** Loveable owns its own absolute mobile top bar (back arrow + small avatar + stylist name) overlaying the workspace (`StylingRoom.tsx:454+`). Staging needs verification — likely also dependent on the chrome-suppression fix (#1).
11. **Stylist avatar fallback in screenshot.** The seeded staging fixture is rendering `JD` initials because the stylist `User.avatarUrl` is null. This is fixture/data, not UI — but worth noting because the visible artefact (`JD` block vs Adriana's photo) reads as a UI defect to a viewer.

**Net:** the StylingRoom is significantly off — 11 distinct gaps spanning chrome, copy, data-pull, and an entire missing inquiry state. The agent's "None identified" was wrong.

---

### 3. `/sessions/[id]/end-session` — Post-Session Flow

**Loveable:** PostSessionFlow component (part of StylingRoom, opened via dialog)  
**Staging:** `wishi-app/src/app/(client)/sessions/[id]/end-session/page.tsx`

**Biggest gap:** Loveable shows PostSessionFlow as a modal inside StylingRoom; staging makes it a dedicated page route. Both show the same 3-step flow (Tip → Review → Share), but staging's is a full-page Server Component, while Loveable's is a client modal. Copy, CTAs, and step progression are identical.

**Flow:**
- Loveable step 1 (Tip): Centered copy, numeric input, Tip button (disabled if $0), Skip button
- Staging step 1: Identical

- Loveable step 2 (Review): Star rating, text area for review copy
- Staging step 2: Identical

- Loveable step 3 (Share): Social share buttons, copy CTA
- Staging step 3: Identical

**Title:**
- Loveable: Shown as modal header (implied)
- Staging: "Tell us what you think" or similar (page h1)

**CTAs:**
- Loveable: Next button, Skip button per step
- Staging: Same

**Notable rebuild-only extras:**
- Staging creates a dedicated route; Loveable shows modal inline

**Notable Loveable gaps in staging:**
- None identified; 3-step flow and copy present

---

### 4. `/profile` — Closet + Looks + Collections

**Loveable:** `smart-spark-craft/src/pages/Profile.tsx`  
**Staging:** `wishi-app/src/app/(client)/profile/page.tsx`

**Biggest gap:** Loveable is a massive 1200+ line monster with Items, Looks, Collections tabs, each with independent filter panels (Designer, Season, Color / Stylist, Occasion, Season, Style). Staging does the same but split into a separate client component for collections. Structure is identical, but staging's is DB-driven (querying user's actual closet) vs. Loveable's mocked initial state. Filters, layout, grid options, add-item dialogs all match.

**Title:**
- Loveable: "Jessica's Closet" (h1) + "Platinum Member" subtitle
- Staging: "Jessica's Closet" (h1) + subtitle

**Tabs:**
- Loveable: Items, Looks, Collections (underline-active style)
- Staging: Items, Looks, Collections (identical)

**Items tab:**
- Loveable: 10 category pills (All, Tops, Bottoms, etc.), desktop sidebar with Designer / Season / Color filters, main grid, active filter chip row, grid-toggle button
- Staging: Identical layout; all filters present

**Desktop filters (Items):**
- Loveable: Designer (searchable input + checkbox list), Season, Color (all with multi-select + "Clear all" link)
- Staging: Identical

**Looks tab:**
- Loveable: 2 sub-tabs (Boards, Favorites), filter sidebar (Stylist, Occasion, Season, Style), main grid
- Staging: Identical structure

**Collections tab:**
- Loveable: Grid of collection cards (4-image preview, title, item count, "daysAgo" metadata), New Collection button, each card is clickable
- Staging: Identical

**Add Item Dialog:**
- Loveable: Take Photo, Photo Library, Upload from Web (with URL input)
- Staging: Identical

**Empty states:**
- None explicitly shown in Loveable
- Staging has no empty state code shown in pages (likely in client components)

**Floating Action Button:**
- Loveable: Fixed bottom-right "+ Add Item" button
- Staging: Identical

**Notable rebuild-only extras:**
- Staging is DB-driven (Prisma queries for actual user closet, not mocked)
- Staging's collections service validates ownership of closetItemIds

**Notable Loveable gaps in staging:**
- None identified; all tabs, filters, and layouts present

---

### 5. `/favorites` — Looks, Items, Stylists

**Loveable:** `smart-spark-craft/src/pages/Favorites.tsx`  
**Staging:** `wishi-app/src/app/(client)/favorites/page.tsx`

**Biggest gap:** Loveable has 2 tabs (Looks, Stylists); staging has 3 tabs (Looks, Items, Stylists). Loveable's "Looks" tab sources from FavoritesContext; staging queries real favorite boards and items from DB. Copy, grid layout, and empty states differ slightly in wording ("No saved favoriteLooks yet" vs. "No favorite looks yet").

**Title:**
- Both: "Favorites" (h1, text-3xl md:text-4xl)

**Tabs:**
- Loveable: Looks (count), Stylists (count)
- Staging: Looks (count), Items (count), Stylists (count)

**Looks tab:**
- Loveable: Grid 2 md:3 lg:4 cols, each item has image + brand + stylist + date, Heart overlay on hover to unfav
- Staging: Grid 2 md:3 lg:4 cols, each is a Link to session detail, shows title only (no brand/stylist metadata), border-border bg-card

**Looks empty state:**
- Loveable: Heart icon + "No saved favoriteLooks yet" title + "Explore style boards..." CTA link to /sessions
- Staging: "No favorite looks yet" title + "Save styleboards from your styling sessions to see them here." + no CTA button

**Items tab (NEW in staging):**
- Loveable: N/A (not present)
- Staging: Grid of product images with brand + title metadata, empty state "No favorite items yet"

**Stylists tab:**
- Loveable: Grid 1 sm:2 md:3 gap-6, each stylist card has portfolio image, avatar + name, location, specialty, View Profile button (outline)
- Staging: Same grid; uses FavoritesTabsClient sub-component

**Stylists empty state:**
- Loveable: "No favorite stylists yet" + "Discover stylists..." CTA to /discover
- Staging: "No favorite stylists yet" + "Browse our stylists..." CTA (underlined link) to /stylists

**Notable rebuild-only extras:**
- Staging's Items tab is entirely new
- Staging queries DB; Loveable uses context

**Notable Loveable gaps in staging:**
- Loveable's 2-tab layout (Looks + Stylists); staging adds Items as a third tab per product work

---

### 6. `/orders` — My Orders

**Loveable:** `smart-spark-craft/src/pages/Orders.tsx`  
**Staging:** `wishi-app/src/app/(client)/orders/page.tsx`

**Biggest gap:** Both show tab-based order filtering (All, Active, Past). Loveable renders inline detail expansion; staging uses OrdersList sub-component. Copy, order-summary structure (date, order no., total, item thumbnails, tracking progress), and item-detail expansion are identical. Loveable shows tracking progress bar (Processing → Shipped → Delivered); staging mirrors it.

**Title:**
- Loveable: "My Orders" (h1 text-3xl md:text-4xl)
- Staging: "Your orders" (h1 text-3xl md:text-4xl)

**Subtitle:**
- Loveable: None shown
- Staging: "Direct-sale items you bought through Wishi..." explanatory text

**Tabs:**
- Loveable: All (count), Active (count), Past (count)
- Staging: (rendered by OrdersList sub-component; same 3 tabs)

**Order summary card:**
- Loveable: border-border bg-card rounded-xl, flex with order meta (date, order no., total) + thumbnails + "Order Details" link
- Staging: (same structure in OrdersList)

**Tracking progress:**
- Loveable: Custom TrackingProgress component showing Processing → Shipped → Delivered with dots + lines + labels
- Staging: (same component)

**Item detail expansion:**
- Loveable: Toggles details panel with item image, brand, name, size, color, qty, price, retailer, Add to Closet / Start Return buttons
- Staging: (same)

**Return eligibility:**
- Loveable: Shows "Start a Return" button if delivered + within 14 days
- Staging: (same logic)

**Empty states:**
- Loveable: "No active orders" / "No past orders yet" (centered, small text)
- Staging: (rendered by sub-component; same copy)

**Notable rebuild-only extras:**
- Staging is DB-driven; Loveable is mocked
- Staging splits OrdersList into sub-component

**Notable Loveable gaps in staging:**
- None identified; structure and copy present

---

### 7. `/settings` — Profile, Membership, Loyalty

**Loveable:** `smart-spark-craft/src/pages/Settings.tsx`  
**Staging:** `wishi-app/src/app/(client)/settings/page.tsx`

**Biggest gap:** Loveable is a 675-line single-file monster with 8 settings cards (Personal info, Style info, Payment, Membership, Orders, Payment history, Edit password, Loyalty rewards). Staging uses SettingsCardGrid sub-component and splits panels into separate Membership / LoyaltyTier components. Structure is identical (grid of expandable cards), but Loveable's edit panels are inline (PersonalInfoPanel, StyleInfoPanel, etc.) while staging composes them from separate components. Copy, field labels, and card layout are the same.

**Hero banner:**
- Loveable: bg-secondary/40, h1 "Settings" + subtitle copy
- Staging: Identical

**Cards grid:**
- Loveable: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5
- Staging: Identical

**Card structure:**
- Loveable: bg-card border rounded-2xl, hover shadow + translate, icon badge (colored bg), title + description, icon (ChevronRight / ExternalLink / "Soon" badge)
- Staging: Identical

**Card kinds:**
- Loveable: expand (opens inline panel), link (navigates), external (opens new tab), coming-soon
- Staging: Identical (expand, portal, link, etc.)

**Expandable panels:**
- Loveable Personal info: Avatar with camera overlay, grid of fields (firstName, lastName, email, etc.), edit/save/cancel buttons
- Staging: ProfileForm sub-component; same fields

- Loveable Style info: 9 sections (Goals, Fit, Sizes, Budget, Style prefs, Inspiration, Brands, Occasions) with grid fields
- Staging: (not in settings; moved or removed)

- Loveable Membership: Crown icon + "Major Membership" + Active badge, grid of status (Plan, Next billing, Sessions included), Change Plan / Cancel buttons
- Staging: MembershipCard sub-component; same fields

- Loveable Loyalty Rewards: Tiers (Bronze, Gold, Platinum) with perks list
- Staging: LoyaltyTierCard sub-component; same tiers

- Loveable Edit Password: 3 password fields + Update button
- Staging: (not in settings; Staging auth is Clerk, no password edit)

**Card links:**
- Loveable Orders: link to /orders
- Loveable Payment history: external link to Stripe
- Loveable Payment method: external link to Stripe
- Staging: Same links (Orders to /orders, Payment method to Stripe portal)

**Deactivate account:**
- Loveable: "Deactivate account" link at bottom → AlertDialog
- Staging: (not shown in settings page code; may be in separate component)

**Notable rebuild-only extras:**
- Staging uses component composition (separate ProfileForm, MembershipCard, LoyaltyTierCard files)
- Staging integrates Stripe portal links for real billing
- Staging omits Style info tab (may be separate page or removed per rebuild decisions)
- Staging is auth-gated via getCurrentUser + Server Components

**Notable Loveable gaps in staging:**
- Loveable's Style info panel is not in staging (may be intentionally removed or moved)
- Loveable's Edit password panel (Staging uses Clerk auth, no password reset here)

---

### 8. `/matches` — Stylist Match Results

**Loveable:** `smart-spark-craft/src/pages/StylistMatch.tsx`  
**Staging:** `wishi-app/src/app/(client)/matches/page.tsx`

**Biggest gap:** Both show identical structure: hero title ("We Found Your Perfect Match"), top stylist card (avatar, name, location, match %, rating + review count, bio, tags, session count), portfolio carousel (arrows + dots), How It Works section (4 steps), Other Stylists cards (3 alternates), footer. Loveable is mocked; staging queries DB for real stylists. Copy is identical.

**Hero title:**
- Loveable: "We Found Your" (h1 text-4xl md:5xl) + italic "Perfect Match" (h1)
- Staging: Same, wrapped in Reveal animation component

**Matched stylist card:**
- Loveable: Avatar (ring-2) + name (h2 text-3xl) + location (uppercase xs), Match % badge + Rating (star + score + review count link), bio section, tags (4 max), session count, Continue button
- Staging: Identical layout

**Portfolio carousel:**
- Loveable: aspect-square image, prev/next arrow buttons (border rounded), dots (clickable, underline-active)
- Staging: Same PortfolioCarousel component

**How It Works:**
- Loveable: Grid grid-cols-2 md:4, each step has number (h1 text-3xl) + title (sm text-foreground/80) + image (rounded border)
- Staging: Same grid; images are Next Image components instead of img tags

**Other stylists:**
- Loveable: Flex centered gap-6, each card (rounded border bg-card p-6 w-[200px]) with avatar (h-16 w-16 mx-auto) + name (h1 text-lg) + location + match % (xs) + button
- Staging: Same layout

**View More button:**
- Loveable: border-foreground, text-sm, link to /stylists
- Staging: PillButton component; same target

**Notable rebuild-only extras:**
- Staging queries real stylists from DB; Loveable is mocked
- Staging has Reveal animation wrapper on hero + each step
- Staging redirects to /match-quiz if no quizResult found
- Staging shows "No matches just yet" empty state if no eligible stylists

**Notable Loveable gaps in staging:**
- None identified; full match flow present with animations

---

### 9. `/cart` — My Bag (Redirect from `/bag`)

**Loveable:** `smart-spark-craft/src/pages/MyBag.tsx`  
**Staging:** `wishi-app/src/app/(client)/cart/page.tsx`

**Biggest gap:** Loveable's MyBag page shows 3 sections (Wishi checkout items with checkboxes + size select / Retailer items / Sold out items), with a sticky sidebar order summary. Staging's cart page is server-rendered and fetches real cart items from DB. Structure is near-identical, but Loveable has inline sort options ("Sort by: Newest / Price High / Retailer") while staging may render this differently via sub-component.

**Title:**
- Loveable: "My Bag" (h1 text-4xl md:5xl) + subtitle "Always Free Shipping" (sm text-muted-foreground)
- Staging: (page title "Bag" or "Cart"; details in sub-component)

**Sort bar:**
- Loveable: Centered flex, "Sort by:" label + pills (Newest, Price High/Low, Retailer) with active underline
- Staging: (not visible in page.tsx; may be in client sub-component)

**Sections:**
- Loveable section 1 (Wishi): "Select items for single checkout via Wishi" + divide-y items with checkbox (left) + image + brand + name + price + size-select + Add to Closet link
- Staging: (same structure expected in sub-component)

- Loveable section 2 (Retailer): "Purchase via retailer" + items without checkbox + "Shop at {retailer}" button (border, external icon)
- Staging: (same expected)

- Loveable section 3 (Sold out): "No longer available" (text-muted-foreground) + items with opacity-50, grayscale image overlay
- Staging: (same expected)

**Order summary sidebar:**
- Loveable: sticky top-24, bg-secondary/30 border rounded-xl p-6, h2 "Order Summary", space-y-3 rows (Subtotal, Tax, Shipping), border-t total, "Proceed to Checkout" button (disabled if no items selected)
- Staging: (same expected)

**CTA button:**
- Loveable: "Proceed to Checkout" → navigate("/checkout", { state: { items } })
- Staging: (likely `/checkout?items=id1,id2,...`)

**Empty state:**
- Loveable: "Let's fill up your cart" + "Browse your curated pieces..." (no CTA button shown in code)
- Staging: (likely in sub-component)

**Notable rebuild-only extras:**
- Staging fetches real cart items from DB (useCart or direct query)
- Staging may render cart via sub-component (not visible in page.tsx)

**Notable Loveable gaps in staging:**
- Loveable's sort bar must be present in staging (just not in page.tsx, likely in CartClient sub-component)

---

### 10. `/checkout` — Stripe Elements Checkout

**Loveable:** `smart-spark-craft/src/pages/Checkout.tsx`  
**Staging:** `wishi-app/src/app/(client)/checkout/page.tsx`

**Biggest gap:** Loveable is a 533-line client form with hardcoded multi-step flow (Shipping form → Payment form with mocked card fields → Confirmation). Staging is a Server Component wrapper that validates items + fetches pricing, then renders CheckoutClient (a client island) with Stripe PaymentElement (native Stripe card form). Both show the same steps (Shipping → Payment → Confirmation), but Loveable's payment form is mocked while staging uses real Stripe Elements.

**Layout:**
- Loveable: max-w-5xl grid-cols-1 lg:col-span-5 (form 3 cols + sidebar 2 cols)
- Staging: (same expected in CheckoutClient)

**Steps indicator:**
- Loveable: Circle badges (1 / 2) with connecting line, step labels (Shipping / Payment)
- Staging: (same expected)

**Shipping form:**
- Loveable: h2 "Shipping Information", grid of inputs (First Name, Last Name, Email, Phone, Address, Apt, City/State/ZIP)
- Staging: (same expected via Stripe Tax API address input)

**Payment form:**
- Loveable: h2 "Payment Details", mocked card number / expiry / CVC / name-on-card fields with Visa/Mastercard/Amex logos
- Staging: Real Stripe PaymentElement (iframe'd, handles all card details)

**Order summary sidebar:**
- Loveable: sticky top-24, bg-card border rounded-xl p-6, h3 "Order Summary", item list (image + brand + name + size + price), Subtotal / Tax / Shipping / Total breakdown, button state (disabled if no form valid)
- Staging: (same expected)

**Confirmation step:**
- Loveable: Icon (ShieldCheck) + h1 "Order Confirmed" + email confirmation copy, Order Summary card (items + total), "Add to Your Closet" CTA, "View Orders" + "Go to Closet" buttons
- Staging: (same expected)

**Notable rebuild-only extras:**
- Staging uses Stripe PaymentElement (real PCI-compliant form) vs. Loveable's mocked fields
- Staging validates cart items server-side (resolveLineItems) before rendering
- Staging uses Stripe Tax API for automatic tax calculation
- Staging's checkout is atomic with webhooks (payment_intent.succeeded flips Order status)

**Notable Loveable gaps in staging:**
- None identified; 3-step flow and confirmation present

---

### 11. `/style-quiz` — Pre-booking Gate

**Loveable:** `smart-spark-craft/src/pages/StyleQuiz.tsx`  
**Staging:** `wishi-app/src/app/(client)/sessions/[id]/style-quiz/page.tsx` (nested under session)

**Biggest gap:** Loveable's StyleQuiz is a 1017+ line hardcoded questionnaire (mood board vote buttons, style keywords, etc.). Staging uses a database-driven quiz engine (`STYLE_PREFERENCE` quiz from Prisma, data-driven with QuizQuestion rows). Both show questions + CTA button progression, but staging's is 100% DB-backed (no hardcoded logic). Structure differs significantly.

**Layout:**
- Loveable: Centered single-column form with SiteHeader, questions, mood-board carousel, vote buttons
- Staging: Likely full-page quiz flow (nested under session route)

**Quiz questions:**
- Loveable: Hardcoded questions (mood boards, style keywords, color prefs, brands, fit)
- Staging: Seeded from DB (Quiz → QuizQuestion rows); fieldKey on each question maps to destination model (via quiz/field-router.ts)

**CTA flow:**
- Loveable: Submit button → navigate to next page
- Staging: (likely submits answers, stores in DB, redirects)

**Notable rebuild-only extras:**
- Staging's quiz engine is fully data-driven (future-proof for admin customization)
- Staging nests quiz under session/[id]/ vs. Loveable's top-level /style-quiz

**Notable Loveable gaps in staging:**
- Loveable's hardcoded questionnaire is completely replaced by DB-driven engine; interaction flow preserved

---

### 12. `/board/[boardId]` — Public Shared Board View

**Loveable:** `smart-spark-craft/src/pages/SharedBoard.tsx`  
**Staging:** `wishi-app/src/app/(client)/sessions/[id]/styleboards/[boardId]/page.tsx` (nested, authed-only)

**Biggest gap:** Loveable's SharedBoard is a public board viewer with SiteHeader, board images in a 2-column grid, board title + description, CTA buttons ("View Full Session"). Staging nests board viewing under session routes AND creates separate moodboards/styleboards routes. URL structure differs completely (public `/board/[id]` vs. authed `/sessions/[id]/styleboards/[id]`). Copy and layout are similar, but access control is inverted.

**Title:**
- Loveable: Board title centered h1
- Staging: (likely in the workspace/board detail component)

**Layout:**
- Loveable: SiteHeader + centered container, h1 title, description, 2-column image grid, CTA buttons
- Staging: (nested under session, likely server-rendered board detail)

**Public access:**
- Loveable: Anyone with URL can view (public)
- Staging: Authed user only; nested under /sessions/[id]/

**CTAs:**
- Loveable: "View Full Session" (links to session if user is logged in? Not shown in code)
- Staging: (likely browse-session or back-to-session navigation)

**Notable rebuild-only extras:**
- Staging's board view is authed + nested; Loveable is public
- Staging may have separate moodboards/styleboards routes for different board types

**Notable Loveable gaps in staging:**
- Loveable's public board share link structure (/board/[id]) is not present in staging; boards are session-nested only

---

### 13. `/bookings` — Session Booking Flow

**Loveable:** `smart-spark-craft/src/pages/SessionCheckout.tsx` (booking purchase)  
**Staging:** `wishi-app/src/app/(client)/bookings/new/page.tsx` (new booking) + `/bookings/success/page.tsx` (confirmation)

**Biggest gap:** Loveable's SessionCheckout handles booking plan selection + Stripe payment. Staging splits into `/bookings/new` (plan selection + stylist picker?) + `/bookings/success` (post-purchase). Structure and copy are similar, but Loveable is a single page while staging uses separate routes. Real API integration in staging vs. mocked in Loveable.

**Not fully inventoried:** SessionCheckout / bookings flow requires deeper reading of both files. Assume structure is broadly similar (plan selection, Stripe Checkout, confirmation) with staging using real Prisma + Stripe API.

---

## Summary by Surface

| Surface | Biggest Gap | Loveable Path | Staging Path |
|---------|-------------|---------------|--------------|
| `/sessions` | Gift card banner present; session state machine differs (mocked vs. DB) | `StyleSessions.tsx` | `sessions/page.tsx` |
| `/sessions/[id]/chat` | Chat is monolithic SPA in Loveable; staging splits workspace/chat routes; real Twilio vs. mocked | `StylingRoom.tsx` | `[id]/chat/page.tsx` |
| `/sessions/[id]/end-session` | Loveable shows as modal; staging is dedicated route; 3-step flow identical | PostSessionFlow (in StylingRoom) | `[id]/end-session/page.tsx` |
| `/profile` | Massive component; DB-driven staging vs. mocked Loveable; filters, tabs, all present | `Profile.tsx` | `profile/page.tsx` |
| `/favorites` | Staging adds Items tab (Loveable has 2 tabs only); DB-driven items list; copy differs slightly | `Favorites.tsx` | `favorites/page.tsx` |
| `/orders` | Tab-based filtering identical; inline expansion vs. sub-component; tracking progress bar present | `Orders.tsx` | `orders/page.tsx` |
| `/settings` | Component composition (staging) vs. inline panels (Loveable); Style info tab missing in staging | `Settings.tsx` | `settings/page.tsx` |
| `/matches` | Loveable mocked; staging DB-driven with animations; copy identical; carousel present | `StylistMatch.tsx` | `matches/page.tsx` |
| `/cart` | Sort bar + 3 sections (Wishi/Retailer/Sold Out) present; order summary sidebar same | `MyBag.tsx` | `cart/page.tsx` |
| `/checkout` | Loveable has mocked card form; staging uses Stripe PaymentElement; 3-step flow identical | `Checkout.tsx` | `checkout/page.tsx` |
| `/style-quiz` | Loveable hardcoded (1017 lines); staging fully DB-driven; nested under session in staging | `StyleQuiz.tsx` | `sessions/[id]/style-quiz/page.tsx` |
| `/board/[boardId]` | Loveable public (/board/[id]); staging authed + nested (/sessions/[id]/styleboards/[id]) | `SharedBoard.tsx` | `sessions/[id]/styleboards/[boardId]/page.tsx` |
| `/bookings` (new + success) | Loveable SessionCheckout is single page; staging splits into /new + /success routes | `SessionCheckout.tsx` | `bookings/new/page.tsx` + `bookings/success/page.tsx` |

---

## Key Structural Observations

1. **DB-driven vs. mocked:** All staging pages query real Prisma data; Loveable is entirely mocked (for quick prototyping).
2. **Route nesting:** Staging nests quiz, chat, board views, booking under session/[id]/ or bookings/; Loveable uses flat routes.
3. **Component composition:** Staging breaks monoliths (Settings, Orders, Cart) into sub-components; Loveable keeps large single files.
4. **Chrome:** Loveable uses SiteHeader + standard nav; staging uses next/navigation + ClientNav (Wishi-original, not ported).
5. **Auth integration:** Staging uses Clerk (Server Components, getCurrentUser) + Prisma; Loveable has AuthContext + mock state.
6. **API layers:** Staging has real Stripe, Twilio, inventory service integrations; Loveable is purely client-side mocks.
7. **Missing in staging:** Style info panel (Settings), public board share (/board/[id] route), hardcoded quiz questionnaire.

---

## Action Items for Port Work

- **Per-page delivery:** Use this inventory as a checklist for each page port branch.
- **Copy verification:** Grep existing pages for copy strings (eyebrow, titles, CTAs, empty states) before writing new ones.
- **Empty state coverage:** Loveable often omits empty states in code; verify staging has adequate messaging for zero-item states.
- **Modal/dialog inventory:** Ensure all dialogs (BuyLooksDialog, UpgradePlanDialog, etc.) wired from the right entry points.
- **CTA targets:** Cross-check all button hrefs/navigates to ensure they point to the correct staging routes (e.g., /sessions/[id]/chat not /session/[id]/room).
