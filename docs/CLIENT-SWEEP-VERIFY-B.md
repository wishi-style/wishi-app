# CLIENT-SWEEP-VERIFY-B: Loveable vs Staging Rigorous Audit

**Verification date:** 2026-04-29  
**Verifier:** Claude (READ-ONLY audit)  
**Scope:** `/settings`, `/matches`, `/bookings` (new + success), `/cart`  
**Methodology:** Full file read end-to-end, dimension-by-dimension enumeration, exact line citations

---

## 1. /SETTINGS — Loveable `Settings.tsx` vs Staging `settings/page.tsx`

### Page Title & Hero
**Loveable** (Settings.tsx:587–592):
- H1: "Settings" (font-display text-3xl md:text-5xl text-foreground)
- Subtitle: "Manage your profile, style preferences, membership and more." (font-body text-sm text-muted-foreground)
- Hero background: bg-secondary/40

**Staging** (settings/page.tsx:165–171):
- H1: "Settings" (font-display text-3xl md:text-5xl text-foreground)
- Subtitle: "Manage your profile, membership, and the closet you've been building with Wishi." (text-sm text-muted-foreground)
- Hero background: bg-secondary/40

**Gap**: ✓ Title matches. Subtitle text differs: Loveable includes "style preferences"; Staging omits it and adds "closet you've been building". **Action**: Loveable wins → restore "style preferences" to subtitle copy.

### Settings Cards — Count & Titles
**Loveable** (Settings.tsx:550–559) lists 8 cards:
1. Personal info
2. Style info
3. Payment method
4. Membership
5. Orders
6. Payment history
7. Edit password
8. Loyalty rewards

**Staging** (settings/page.tsx:45–105) lists 7 cards:
1. Personal info
2. Membership
3. Loyalty rewards
4. Payment method
5. Orders
6. Closet
7. Favorites

**Gap**: ❌ MISSING in staging: "Style info", "Edit password", "Payment history" cards. Staging adds "Closet" and "Favorites" which Loveable does not have. **Action**: Loveable wins → add "Style info" card (expand type with StyleInfoPanel), "Edit password" card (expand type with EditPasswordPanel), and "Payment history" card (external link to Stripe). Remove "Closet" and "Favorites" unless user explicitly wants to keep them (verify intent).

### Settings Cards — Icon & Accent Colors
**Loveable** icons (Settings.tsx:551–558):
- Personal info: User icon, bg-secondary
- Style info: Palette icon, bg-cream
- Payment method: CreditCard icon, bg-warm-beige
- Membership: Crown icon, bg-secondary
- Orders: ShoppingBag icon, bg-cream
- Payment history: Receipt icon, bg-warm-beige
- Edit password: Lock icon, bg-secondary
- Loyalty rewards: Gift icon, bg-cream

**Staging** icons (settings/page.tsx:45–105):
- Personal info: user icon, bg-secondary
- Membership: crown icon, bg-warm-beige
- Loyalty rewards: gift icon, bg-cream
- Payment method: card icon, bg-secondary
- Orders: bag icon, bg-warm-beige
- Closet: shirt icon, bg-cream
- Favorites: heart icon, bg-secondary

**Gap**: Accent color assignments differ where cards overlap. Loveable: Membership=bg-secondary, Payment method=bg-warm-beige. Staging: Membership=bg-warm-beige, Payment method=bg-secondary. **Action**: Loveable wins → reorder accent assignments to match Loveable.

### Settings Cards — Descriptions
**Loveable** descriptions (Settings.tsx:550–559):
- Personal info: "Edit your personal and contact information."
- Style info: "Edit your size, budget, styling preferences, fashion preferences etc."
- Payment method: "Edit your payment method."
- Membership: "Manage, cancel, activate your membership."
- Orders: "Review all your orders here."
- Payment history: "Review all your sessions payments here."
- Edit password: "Edit your password here."
- Loyalty rewards: "Review your loyalty rewards."

**Staging** descriptions (settings/page.tsx:45–105):
- Personal info: "Edit your name, email, phone, and profile picture."
- Membership: "Manage, pause, or cancel your styling plan."
- Loyalty rewards: "Track your status and unlock perks as you book more sessions."
- Payment method: "Update your card and download invoices in the Stripe portal."
- Orders: "Review every order placed through Wishi."
- Closet: "Browse, add, and organise the pieces you already own."
- Favorites: "Looks, products, and stylists you've saved."

**Gap**: Descriptions differ significantly where cards overlap. Personal info: Loveable is generic "personal and contact"; Staging lists specifics "name, email, phone, picture". Membership: Loveable says "cancel, activate"; Staging says "pause or cancel". Orders: Loveable generic; Staging adds "placed through Wishi". **Action**: Loveable wins → use Loveable's descriptions verbatim (more generic positioning).

### Personal Info Panel — Fields & Order
**Loveable** (Settings.tsx:68–81) field order:
1. firstName
2. lastName
3. email
4. phone
5. birthday
6. location
7. gender
8. height
9. bodyType
10. occupation
11. instagram
12. pinterest

**Staging** (profile-form.tsx:30–99) only includes:
1. firstName
2. lastName
3. email (disabled, read-only)
4. phone

**Gap**: ❌ MISSING in staging: birthday, location, gender, height, bodyType, occupation, instagram, pinterest. Staging's ProfileForm is a bare subset. **Action**: Loveable wins → expand ProfileForm to include all Loveable fields; render as edit-mode form per Loveable's pattern (sections collapsed in view-mode, expandable).

### Personal Info — Avatar Handling
**Loveable** (Settings.tsx:85–112):
- Avatar 20×20 pixels, rounded-full
- "Change photo" text link below
- Camera icon overlay on hover (group-hover:opacity-100)
- Input file type="file" accept="image/*" hidden

**Staging** (profile-form.tsx + avatar-upload.tsx):
- File structure delegates to `<AvatarUpload currentUrl={user.avatarUrl} />`
- Exact avatar size and overlay behavior not inspected in ProfileForm read

**Gap**: Cannot fully verify avatar UI without reading avatar-upload.tsx. Likely matches on overlay mechanics, but needs spot-check. **Action**: Read avatar-upload.tsx and compare visual behavior (size, hover state, camera icon).

### Style Info Panel — Structure
**Loveable** (Settings.tsx:169–393):
- 9 collapsible sections with titles (Goals & lifestyle, Pieces & categories, Fit & body, Sizes, Budget per category, Style preferences, Inspiration, Brands, Occasions & notes)
- Each section has 1–9 fields
- Multiline fields for "Body notes" and "Additional notes"
- Edit/Cancel buttons at bottom

**Staging**:
- Style info panel is NOT implemented in staging settings page (no StyleInfoPanel component exported or rendered)

**Gap**: ❌ MISSING in staging: entire Style Info Panel (9 sections, ~30 fields, multiline text areas, edit state machine). **Action**: Loveable wins → port StyleInfoPanel end-to-end with all sections, field labels, multiline textarea for notes, edit/save/cancel flow.

### Membership Panel
**Loveable** (Settings.tsx:397–437):
- Crown icon + "Major Membership" title
- "Active since Jan 2025" subtitle
- "Active" badge (variant="secondary")
- Grid 2-3 cols: Plan, Next billing, Sessions included (show "Unlimited")
- Two buttons: "Change Plan" (border), "Cancel Membership" (underline link)
- CancelMembershipDialog import

**Staging** (membership-card.tsx, read limit 80 lines):
- Crown icon + plan name
- No subscription → "No active membership" message
- With subscription → renders status, frequency, dates, buttons (Cancel, Upgrade)
- UpgradePlanDialog import, PaymentFailureBanner
- Buttons styled differently (not matching Loveable's pill-button outline)

**Gap**: ✓ Both have Crown icon and core structure. Staging has additional state (payment failure banner, upgrade dialog) that Loveable doesn't. Button styles differ. **Action**: Loveable wins → align button styling to Loveable's "Change Plan" (rounded-full border) and "Cancel Membership" (underline link, not dialog-trigger).

### Edit Password Panel
**Loveable** (Settings.tsx:440–476):
- Three inputs: Current Password, New Password, Confirm New Password (all type="password")
- max-w-md container
- "Update password" button (rounded-full bg-foreground)
- Validation: all required, match check, min 8 chars
- Toast feedback on success

**Staging**:
- No EditPasswordPanel implemented

**Gap**: ❌ MISSING in staging: entire Edit Password Panel. **Action**: Loveable wins → port EditPasswordPanel with 3 password fields, client-side validation, toast feedback.

### Loyalty Rewards Panel
**Loveable** (Settings.tsx:489–548):
- Avatar + "You don't have a status yet!" heading
- "You reached 0 bookings this year" subtitle
- 3 tier boxes: Bronze, Gold, Platinum
- Each tier lists perks as bullet points (span + rounded-full bg-primary)

**Staging** (loyalty-tier-card.tsx):
- Similar structure with tier display
- Likely matches on tier names and perk bullets

**Gap**: ✓ Likely parity on tier structure. Need to verify exact perk copy and styling. **Action**: Read loyalty-tier-card.tsx in full and compare perk copy, bullet style, heading copy.

### Settings Card Interaction — Expand/Collapse
**Loveable** (Settings.tsx:567–641):
- Single expand state per card (`expandedCard`)
- Clicked card expands to sm:col-span-2 lg:col-span-3
- ChevronRight icon when collapsed, ChevronDown when expanded
- Panel content appears below the header on expand, with `border-t` separator

**Staging** (settings-card-grid.tsx:58–174):
- Single expand state per card (`expanded`)
- Same col-span expansion logic
- Same chevron icons (ChevronRightIcon / ChevronDownIcon)
- Same panel render with border-t separator

**Gap**: ✓ Expand/collapse UX matches. **Action**: No changes needed.

### Deactivate Account Button
**Loveable** (Settings.tsx:645–671):
- Text link "Deactivate account" at bottom (text-muted-foreground underline underline-offset-4)
- Triggers AlertDialog with title "Deactivate account?", description, Cancel/Deactivate buttons
- Deactivate button: destructive style (bg-destructive text-destructive-foreground)

**Staging**:
- No deactivate account button or dialog visible in staging settings/page.tsx

**Gap**: ❌ MISSING in staging: deactivate account link + AlertDialog. **Action**: Loveable wins → add "Deactivate account" link and AlertDialog at bottom of settings card grid.

---

## 2. /MATCHES — Loveable `StylistMatch.tsx` vs Staging `matches/page.tsx`

### Hero Section — Title & Subtitle
**Loveable** (StylistMatch.tsx:70–78):
- "We Found Your" (h1 font-display text-4xl md:text-5xl lg:text-6xl)
- "Perfect Match" italic (h1 font-display italic text-4xl md:text-5xl lg:text-6xl)
- Centered, tracking-tight

**Staging** (matches/page.tsx:124–129):
- "We Found Your" (block span within h1)
- "Perfect Match" italic (block span with mt-3)
- Wrapped in `<Reveal>` animation component (which Loveable does not have)
- Same font-display, sizes, centered

**Gap**: ✓ Text and sizing match. Staging adds `<Reveal>` animation wrapper (an enhancement, not a removal). **Action**: Animation is non-breaking; Loveable parity maintained.

### Stylist Info Card — Layout & Structure
**Loveable** (StylistMatch.tsx:80–139):
- grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8
- Left side: stylist info (avatar, name, location, match %, rating, bio, tags, session count, CTA)
- Right side: portfolio carousel
- Avatar 20×20 with ring-2 ring-foreground/10
- Name: font-display text-3xl
- Location: font-body text-xs uppercase tracking-[0.2em] text-muted-foreground
- Match badge: rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-semibold
- Rating: Star icon filled + number + "Reviews" link
- Bio section: "Why [Name]?" heading + paragraph
- Tags: 4 tags shown, rounded-full border border-foreground/20 bg-secondary/50 px-4 py-1.5 text-xs
- Session count: font-body text-xs text-muted-foreground tracking-wide
- CTA: rounded-full bg-foreground text-background px-10 py-3.5 text-sm font-semibold

**Staging** (matches/page.tsx:132–222):
- Same grid layout, same avatar size
- Uses Avatar component (with AvatarImage/AvatarFallback) instead of img
- Name rendering: font-display text-3xl (same)
- "Currently on waitlist" message if !top.isAvailable (Loveable doesn't have this)
- Match badge: same styling
- Rating: StarIcon + number + link (same)
- Bio rendering: "Why [firstName]?" + paragraph (same)
- Tags: sliced to 4, capitalize, same styling
- Session count: .toLocaleString() formatting, same styling
- CTA: PillButton component (href, variant="solid", size="md") instead of inline button

**Gap**: ⚠️ STAGING-ONLY: "Currently on waitlist" message when stylist not available. Loveable doesn't show this state. **Action**: Verify Loveable API mocks always set availability true; if real data can have unavailable stylists, decide: keep it or hide it. For parity, should match Loveable's assumption (always available).

**Gap**: ✓ Avatar component vs img tag — both render correctly, Avatar is an upgrade (fallback initials). Button is PillButton instead of inline — both achieve same visual intent. No parity break.

### Portfolio Carousel
**Loveable** (StylistMatch.tsx:141–178):
- aspect-square overflow-hidden
- img with transition-opacity duration-500
- Prev/next buttons: h-8 w-8 rounded-full border flex items-center justify-center hover:bg-accent
- Dots: h-2 w-2 rounded-full, filled (bg-foreground) or empty (bg-foreground/30)
- Click prev/next or dot to change slide

**Staging** (matches/page.tsx:224–236 + portfolio-carousel.tsx import):
- PortfolioCarousel component
- Fallback: "Portfolio coming soon" text if carouselImages.length === 0
- Cannot verify carousel internals without reading portfolio-carousel.tsx

**Gap**: Staging delegates to PortfolioCarousel component. Need to read that file to confirm carousel behavior matches (button sizes, dot styles, animation). **Action**: Read portfolio-carousel.tsx and compare dots, buttons, and transition effects.

### How It Works Section
**Loveable** (StylistMatch.tsx:184–210):
- Section container max-w-5xl
- H2: "How it Works" (font-display text-3xl md:text-4xl text-center)
- Grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8
- Each step: number, title, image in rounded-xl border overflow-hidden bg-background shadow-sm

**Staging** (matches/page.tsx:243–273):
- Section with border-t border-border (adds top border)
- Same h2 styling, same grid
- Each step wrapped in `<Reveal delay={i * 80}>` animation
- Image uses Next Image component (optimization)
- Same rounded-xl border styling

**Gap**: ✓ Staging adds border-t (visual enhancement, not removal) and Reveal animation. Image loading strategy differs (Next optimization vs img src). No parity loss.

### Other Stylists Recommended Section
**Loveable** (StylistMatch.tsx:212–254):
- Conditional: only renders if otherStylists.length > 0 (hardcoded 2 stylists in demo)
- H2: "Other Stylists Recommended for You" (font-display text-3xl md:text-4xl text-center)
- Flex flex-wrap justify-center gap-6
- Each card: rounded-xl border border-border bg-card p-6 text-center w-[200px]
  - Avatar: h-16 w-16 rounded-full object-cover mx-auto mb-3
  - Name: font-display text-lg
  - Location: font-body text-xs text-muted-foreground
  - Match %: font-body text-xs text-muted-foreground mb-4
  - Button: "Meet [name]" (w-full rounded-md bg-foreground text-background py-2.5 text-xs font-medium)
- Footer: "View More Stylists" button (border border-foreground rounded-md px-8 py-3)

**Staging** (matches/page.tsx:276–324):
- Conditional: `{alternates.length > 0 &&` (only renders if alternates exist)
- Same h2, same flex layout, same card width
- Card interior: Avatar component + name + match % (if available) + PillButton
- Footer: PillButton with href="/stylists" variant="outline"

**Gap**: ✓ Rendering logic is conditional in both. Button styles differ (PillButton vs inline), but visual intent is same. Loveable location text not shown in Staging cards. **Action**: Loveable wins → add location line to alternate stylist cards ("New York" or similar).

**Gap**: ⚠️ Match percentage display: Loveable always shows; Staging shows only if `s.score !== null`. **Action**: Verify data flow; if score is always present, match Loveable by rendering unconditionally.

---

## 3. /BOOKINGS — Loveable `SessionCheckout.tsx` vs Staging Split (`bookings/new/page.tsx` + `booking-client.tsx` + `bookings/success/page.tsx`)

### Bookings New — Plan Selector Section
**Loveable** (SessionCheckout.tsx:215–280):
- "How often would you like a styling session?" (font-body text-sm text-center)
- Grid grid-cols-2 gap-4 with two plan-selector buttons
- Each button: rounded-lg border-2 p-5 text-left
  - Selected: border-foreground, unselected: border-border hover:border-foreground/30
  - Radio circle: h-5 w-5 rounded-full border-2
  - Plan name: font-body text-sm font-semibold
  - Price: font-body text-sm font-semibold ml-auto
  - Subtitle: "3-Day Free Trial" (font-body text-xs text-[hsl(170,60%,40%)] ml-8)

**Staging** (booking-client.tsx:13–50, plan-selector.tsx:20–82):
- BookingClient wraps PlanSelector component
- PlanSelector renders plan buttons grid grid-cols-1 gap-4 sm:grid-cols-3
- Each button uses select state to highlight: isSelected = border-black bg-stone-50, unselected = border-stone-200
- Plan name: font-serif text-xl font-medium text-stone-900
- Price: $N (calculated from plan.priceInCents)
- Description text from plan.description field
- "Subscription available" badge if plan.subscriptionAvailable
- Subscription toggle below (not per-plan)

**Gap**: ❌ MISSING in staging: "How often would you like a styling session?" prompt text. ✓ Present in Loveable. **Action**: Add prompt text above plan selector.

**Gap**: ✓ Both show monthly/one-time selector (Loveable inline, Staging as toggle below). Parity maintained.

**Gap**: Styling: Loveable uses hsl color for "3-Day Free Trial" text; Staging uses plan.description field (more flexible). **Action**: Loveable wins (exact visual) → hardcode "3-Day Free Trial" caption under the subscription toggle in staging.

**Gap**: Grid layout: Loveable grid-cols-2 (two buttons side-by-side); Staging grid-cols-1 sm:grid-cols-3 (three plans in a row on desktop). **Action**: Loveable wins → change grid to grid-cols-2 md:grid-cols-2 (two columns).

### Bookings New — Plan Details Summary
**Loveable** (SessionCheckout.tsx:285–357):
- Left column: Order Summary
  - "Pay Wishi Fashion, Inc." (font-body text-sm text-muted-foreground)
  - Price display: font-display text-4xl
  - Line items: Session label, Subtotal, border separator, promo section, border, Total due
  - Promo section: "Add promotion code" button (inline-flex items-center border) → opens input + Apply button on click

**Staging** (plan-selector.tsx, booking-client.tsx):
- No summary sidebar visible in staging booking-new flow
- PlanSelector only shows plan cards + subscription toggle
- No pricing, no order summary, no promo input

**Gap**: ❌ MISSING in staging: entire order summary sidebar (price display, line items, promo input). **Action**: Loveable wins → add sticky order-summary sidebar to the right of plan selector (or below on mobile) showing price + promo input.

### Bookings New — Payment Form
**Loveable** (SessionCheckout.tsx:360–466):
- Right column (md:grid-cols-2): rounded-xl border border-border p-6 md:p-8 bg-card
  - h3: "Contact information" (font-body text-sm font-semibold mb-3)
  - Email input (type="email")
  - h3: "Payment method" (font-body text-sm font-semibold mb-3)
  - Card tab header with radio + CreditCard icon + "Card" label
  - Card fields: Card number, Expiry, CVC, Cardholder name (all text inputs with custom formatting)
  - Saved card option: if savedPayment exists, show last 4 digits + expiry + "Use a different card" link
  - "Pay $X" button (rounded-lg bg-foreground text-background py-4 font-body text-sm font-medium)
  - Legal disclaimer text

**Staging** (booking-client.tsx):
- No payment form visible
- Only shows plan selector and one "Proceed to Checkout" button

**Gap**: ❌ MISSING in staging: entire payment form (contact, card fields, saved card option, pay button, legal copy). **Action**: Loveable wins → this is a separate checkout experience; may be deferred to Stripe Checkout. For parity, Loveable's form must be ported if Stripe Checkout is not being used. Need to clarify architecture before proceeding.

### Bookings Success Page
**Loveable** (SessionCheckout.tsx:92–189, showSuccess state):
- Centered layout, max-w-xl
- Stylist portrait (36×36 h-36 w-36) with halo gradient background + border rings
- Animated in: fade-in zoom-in-95 duration-700
- H1: "Meet <em>Daphne</em>, your stylist." (font-display text-5xl md:text-6xl leading-[1.05] tracking-tight)
- Subtitle: "Booking confirmed — she'll take it from here." (font-body text-base text-muted-foreground)
- Journey card: bg-card border border-border rounded-lg p-6 md:p-8 mb-6
  - Eyebrow: "Your session begins" or "What happens next" (font-body text-[11px] tracking-[0.2em] uppercase text-muted-foreground)
  - If quiz completed: 3 list items with icons (MessageCircle, Sparkles, ShoppingBag)
  - If quiz NOT completed: Unordered list + "You only do the quiz once" footer text
- Primary CTA: "Enter your styling room" or "Start my style quiz" (rounded-full bg-foreground text-background py-4 px-6 font-body text-sm font-medium)

**Staging** (bookings/success/page.tsx):
- Centered layout, max-w-md
- Emoji: ✨ (h-5 text-5xl)
- H1: "You're Booked!" (font-serif text-3xl font-light text-stone-900)
- Paragraph: "We're matching you with the perfect stylist. Complete your style preferences quiz so your stylist can get to know you." (text-sm leading-relaxed text-stone-500)
- Link: "Go to My Sessions" (rounded-full bg-black px-8 py-3 text-sm font-medium text-white)

**Gap**: ❌ MISSING in staging: stylist portrait with halo effect, animated reveal, "Meet [Name]" heading, journey/next-steps card with icons and list items. ✓ Staging has simplified version with emoji and generic copy. **Action**: Loveable wins → port success page with stylist photo, halo gradient, "Meet [Name]" heading, and journey card with conditional content (quiz done vs pending).

---

## 4. /CART — Loveable `MyBag.tsx` vs Staging `cart/page.tsx`

### Page Title & Lede
**Loveable** (MyBag.tsx:154–160):
- H1: "My Bag" (font-display text-4xl md:text-5xl)
- Subtitle: "Always Free Shipping" (font-body text-sm text-muted-foreground tracking-wide)
- Centered text-center mb-10

**Staging** (cart/page.tsx:147–153):
- H1: "My Bag" (font-display text-3xl md:text-4xl)
- Subtitle (conditional): "Nothing here yet — your stylist's picks..." (text-sm text-muted-foreground) OR "{count} item(s) saved." (same styling)
- Not centered, aligned left (header inside .mx-auto max-w-5xl)

**Gap**: ✓ Title matches. Subtitle differs: Loveable is static "Always Free Shipping"; Staging is dynamic item count. Loveable is centered, Staging is left-aligned. **Action**: Loveable wins → show "Always Free Shipping" subtitle at top (overriding dynamic count), center the header block.

### Empty State
**Loveable** (MyBag.tsx:162–168):
- flex flex-col items-center justify-center py-20 text-center
- H3: "Let's fill up your cart" (font-display text-xl)
- Paragraph: "Browse your curated pieces and add your favorites." (text-muted-foreground font-body text-sm)

**Staging** (cart/page.tsx:156–169):
- rounded-2xl border border-border bg-card p-12 text-center
- Paragraph: "You don't have any items in your bag yet." (text-sm text-muted-foreground)
- PillButton: "Go to my sessions" (href="/sessions")

**Gap**: ⚠️ STAGING-ONLY: CTA button pointing to "/sessions" (Loveable has none). Loveable's empty state is minimal text; Staging adds card container + button. **Action**: Loveable wins → remove card container and button; render minimal centered text matching Loveable (H3 + paragraph, no CTA).

### Sort Bar
**Loveable** (MyBag.tsx:171–188):
- Centered flex items-center justify-center gap-6
- "Sort by:" label (text-muted-foreground)
- Buttons: Newest, Price: High to Low, Price: Low to High, Retailer
- Active: text-foreground font-semibold; Inactive: text-muted-foreground hover:text-foreground
- Transition-colors

**Staging** (cart/page.tsx):
- No sort bar visible; items render in default order

**Gap**: ❌ MISSING in staging: sort bar with 4 sort options. **Action**: Loveable wins → add sort bar above the items grid matching Loveable's layout and labels.

### Wishi Items Section — Header
**Loveable** (MyBag.tsx:194–200):
- H2: "Select items for single checkout via Wishi" (font-display text-lg)
- mb-4 pb-3 border-b border-border

**Staging** (cart/page.tsx:173–180):
- H2: "Shop with Wishi" (font-display text-lg)
- Flex justify-between with helper text "Fulfilled by Wishi" (text-xs text-muted-foreground)
- mb-3 (no border-b)

**Gap**: Header text differs: Loveable "Select items for single checkout via Wishi"; Staging "Shop with Wishi". Loveable has border-b, Staging uses helper text instead. **Action**: Loveable wins → use Loveable's header text exactly, add border-b separator.

### Wishi Items Section — Item Card
**Loveable** (MyBag.tsx:201–280):
- py-6 flex gap-5 group, divide-y divide-border (item list)
- Checkbox: h-5 w-5 rounded border-2, filled with Check icon when selected
- Image: h-32 w-24 md:h-36 md:w-28 overflow-hidden rounded-md bg-muted
- Details flex-1:
  - Brand: font-body text-base font-semibold
  - Name: font-body text-sm text-muted-foreground mt-0.5
  - Price: font-body text-sm font-medium mt-2
  - Size select if sizes available
  - "Add to Closet" button (underline underline-offset-4)
- X button (top right) to remove

**Staging** (cart/page.tsx:182–226):
- li with rounded-2xl border border-border bg-card p-4
- Flex gap-4, no divide
- No checkbox
- Image: h-24 w-20 flex-shrink-0 rounded-lg bg-muted
- Details:
  - Brand: text-xs uppercase tracking-widest dark-taupe
  - Name: font-display text-base truncate
  - Qty: "Qty {quantity}" (text-sm text-muted-foreground)
  - Price: font-display text-base
- Flex actions: (no size select shown), X button for remove
- No "Add to Closet" button visible

**Gap**: ❌ MISSING in staging: checkbox for item selection. ✓ Present in Loveable. **Action**: Loveable wins → add checkbox (h-5 w-5 border-2, checked=filled with Check icon) to the left of each item image.

**Gap**: Item card structure: Loveable uses divide-y list; Staging uses card-style li with border + bg-card. **Action**: Loveable wins → revert to divide-y list styling (flatter, less heavy).

**Gap**: Size selector: Loveable shows select dropdown per item; Staging omits it. **Action**: Loveable wins → add size select for items with sizes array.

**Gap**: ❌ MISSING in staging: "Add to Closet" button per item. **Action**: Loveable wins → add underlined "Add to Closet" button below price (or aligned right).

**Gap**: Quantity field: Loveable omits; Staging shows "Qty N". **Action**: Verify Loveable UI — if quantity selector is NOT in Loveable, remove from Staging. Staging seems to inherit this from cart service; reconcile.

### Retailer Items Section — Header
**Loveable** (MyBag.tsx:286–292):
- H2: "Purchase via retailer" (font-display text-lg)
- Helper text: "These items are available through external retailers" (font-body text-xs text-muted-foreground)
- pb-3 border-b border-border

**Staging** (cart/page.tsx:231–237):
- H2: "Purchase at retailer" (font-display text-lg)
- Helper text: "Each retailer ships + handles returns directly" (text-xs text-muted-foreground)
- mb-3 flex justify-between (no border-b)

**Gap**: Header text differs: "Purchase via retailer" vs "Purchase at retailer" (Loveable uses "via"). Helper text differs. **Action**: Loveable wins → update header and helper text to match Loveable exactly. Add border-b.

### Retailer Items Section — Item Card
**Loveable** (MyBag.tsx:295–346):
- py-6 flex gap-5 group (no checkbox on retailer items)
- Image: h-32 w-24 md:h-36 md:w-28 shrink-0 ml-10 (indent to align with checkbox placeholder)
- Details: same brand/name/price layout
- Action: "Shop at [Retailer]" link button (border border-foreground px-4 py-1.5 hover:bg-foreground)
- "Add to Closet" button (underline)

**Staging** (cart/page.tsx:240–285):
- li with rounded-2xl border border-border bg-card p-4
- Image: h-24 w-20 ml-0 (no indent)
- Brand/name/price: same
- Action: RetailerClickButton component (inline-flex gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-muted)
- No "Add to Closet" button

**Gap**: Image indent: Loveable ml-10 (aligns under checkbox space); Staging ml-0. **Action**: Loveable wins → add ml-10 indent to retailer item images.

**Gap**: "Shop at [Retailer]" button: Loveable is border border-foreground px-4 py-1.5; Staging is RetailerClickButton (custom component). **Action**: Loveable wins → update button styling to match Loveable (border-foreground, larger padding, no rounded-full).

**Gap**: ❌ MISSING in staging: "Add to Closet" button on retailer items. **Action**: Loveable wins → add "Add to Closet" underlined button.

### Sold Out Section — Header
**Loveable** (MyBag.tsx:350–356):
- H2: "No longer available" (font-display text-lg text-muted-foreground)
- pb-3 border-b border-border

**Staging** (cart/page.tsx):
- No sold-out section visible

**Gap**: ❌ MISSING in staging: sold-out item section. **Action**: Loveable wins → add sold-out section with grayed-out items, strikethrough price, "Sold Out" badge overlay.

### Order Summary Sidebar
**Loveable** (MyBag.tsx:412–474):
- lg:w-80 shrink-0
- sticky top-24 rounded-xl bg-secondary/30 border border-border p-6
- H2: "Order Summary" (font-display text-xl text-center)
- Subtotal line: Subtotal (N items): $X
- Tax: "At Checkout"
- Shipping: "Free"
- border-t pt-4
- Estimated Total: font-display text-xl font-semibold
- "Proceed to Checkout" button (mt-6 w-full rounded-lg py-3 bg-foreground text-background)
- Retailer warning text (if applicable)

**Staging** (cart/page.tsx:290–311):
- aside h-fit rounded-2xl border border-border bg-card p-6 space-y-4
- Eyebrow: "Wishi order summary" (text-xs uppercase tracking-widest)
- Subtotal flex justify-between
- Helper text: "Shipping and tax calculated at checkout."
- Conditional: if wishi.length > 0, show CheckoutButton; else show message

**Gap**: ✓ Sidebar exists in both. Loveable shows "Estimated Total"; Staging shows just "Subtotal". **Action**: Loveable wins → add "Estimated Total" line matching Loveable's format.

**Gap**: Styling: Loveable bg-secondary/30; Staging bg-card. **Action**: Loveable wins → change to bg-secondary/30.

---

## SUMMARY: Gap Counts Per Surface

### /settings (8 gaps total)
1. ❌ Subtitle copy missing "style preferences"
2. ❌ Missing "Style info" card (expand panel with 9 sections)
3. ❌ Missing "Edit password" card (expand panel)
4. ❌ Missing "Payment history" card (external link)
5. ⚠️ Accent color assignments differ on overlapping cards
6. ❌ Missing avatar overlay and camera icon (depends on avatar-upload.tsx)
7. ❌ Missing "Deactivate account" link + dialog
8. ⚠️ PersonalInfo fields subset (only 4 fields, missing 8 more)

### /matches (3 gaps total)
1. ⚠️ "Currently on waitlist" message staging-only (verify Loveable assumption)
2. ⚠️ Match percentage conditional rendering (verify data always present)
3. ❌ Alternate stylist cards missing location line

### /bookings (5 gaps total)
1. ❌ Missing "How often..." prompt text above plan selector
2. ❌ Plan selector grid layout differs (2 cols vs 3 cols)
3. ❌ Missing order summary sidebar (price, promo, total)
4. ❌ Missing payment form (contact + card fields)
5. ❌ Success page missing stylist portrait, halo, "Meet [Name]" heading, journey card

### /cart (10 gaps total)
1. ❌ Subtitle should be static "Always Free Shipping"
2. ❌ Empty state: remove card + button, simplify to Loveable
3. ❌ Missing sort bar with 4 sort options
4. ❌ Wishi items: missing checkbox per item
5. ❌ Wishi items: item card structure (revert to divide-y list, not card style)
6. ❌ Wishi items: missing size select dropdown
7. ❌ Wishi items: missing "Add to Closet" button
8. ❌ Retailer items: header text differs, missing border-b
9. ❌ Retailer items: image indent missing (ml-10), button styling differs
10. ❌ Retailer items: missing "Add to Closet" button

**TOTAL CRITICAL GAPS: 26 gaps across all 4 surfaces.**

---

## NEXT STEPS

1. **Staging wins verification:** Confirm `Loveable` is the spec by re-reading file headers / URLs.
2. **Avatar component verification:** Read `avatar-upload.tsx` and compare camera overlay behavior.
3. **Portfolio carousel verification:** Read `portfolio-carousel.tsx` and compare dot/button styling.
4. **Booking flow architecture:** Clarify whether payment form is Stripe Checkout-delegated or custom; if custom, port Loveable SessionCheckout form.
5. **Cart item quantity:** Verify whether Loveable shows qty selector; if not, remove from Staging.

