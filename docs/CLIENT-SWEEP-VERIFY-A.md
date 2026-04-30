# Client Sweep Verification — Set A

**Surfaces:** `/profile`, `/favorites`, `/collections`, `/orders`
**Method:** Source-vs-source, Loveable as template.

---

## /profile — 18 gaps

1. **❌ MISSING: multi-select category filter (with underline indicator).** Loveable: `Profile.tsx:369-396` multi-select with visual underline. Staging: `profile/client.tsx:147-215` single-select only, no category filter on desktop. Action: add multi-select category pills.
2. **❌ MISSING: "Clear all" link in desktop sidebar filter header.** Loveable: `Profile.tsx:403-415`. Staging: no clear-all. Action: add link next to "Filter" heading when any filter is active.
3. **❌ MISSING: active-filter chip row below toolbar.** Loveable: `Profile.tsx:612-681` chips with X close + "Clear all". Staging: none. Action: render chip row after item count display, `rounded-full border-border px-3 py-1`.
4. **⚠️ STAGING-ONLY: single-select filter behavior.** `profile/client.tsx:195-199` toggles single value; Loveable uses Set per dimension. Action: switch to multi-select Sets (category, designer, season, color).
5. **❌ MISSING: grid-size toggle (Normal/Compact).** Loveable: `Profile.tsx:574-579` `LayoutGrid` / `Grid3X3` toggle. Staging: none. Action: add toolbar toggle.
6. **❌ MISSING: select-mode UI (checkboxes + bulk Delete + Cancel).** Loveable: `Profile.tsx:585-607`. Staging: hover-only delete (`profile/client.tsx:241-264`). Action: implement select-mode toggle, checkbox overlay, "Delete (N)" + "Cancel" actions.
7. **❌ MISSING: brand label below image in grid.** Loveable: `Profile.tsx:714` always-visible `<p>{item.brand}</p>`. Staging: name in gradient hover overlay only. Action: add visible brand row.
8. **❌ MISSING: Looks tab — "Style boards" / "Favorites" sub-tabs.** Loveable: `Profile.tsx:1041-1064`. Staging: `profile/client.tsx:272-296` only saved looks. Action: add sub-tab toggle filtering grid.
9. **⚠️ STAGING-ONLY: looks grid renders blank `aspect-square bg-stone-100` placeholders.** `profile/client.tsx:289`. Loveable: `Profile.tsx:1123-1129` real images. Action: source `Board.thumbnailUrl` (or first item image) and render.
10. **❌ MISSING: collection detail modal (alt to detail page).** Loveable: cards open dialog with full content. Staging: links to `/collections/[id]`. **Structural note:** keep both; ensure modal-or-page content matches Loveable's contract verbatim.
11. **❌ MISSING: collection 4-up preview grid.** Loveable: `Profile.tsx:1160-1166` `grid-cols-4 gap-1.5` `aspect-[3/4]`. Staging: `profile/client.tsx:320-339` 2×2. Action: change to 1×4 horizontal.
12. **❌ MISSING: chevron in circular hover background on collection cards.** Loveable: `Profile.tsx:1175-1177` `group-hover:bg-muted` on circle. Staging: chevron always visible, no bg. Action: hover-reveal circular bg.
13. **⚠️ FONT TOKEN DRIFT.** Staging uses `font-serif` (e.g. `profile/client.tsx:342`); Loveable uses `font-display`. Action: replace `font-serif` → `font-display` for headings.
14. **❌ MISSING: floating "Add Item" button.** Loveable: `Profile.tsx:1214-1220` `fixed bottom-8 right-8` Plus + "Add Item". Staging: toolbar button only. Action: add fixed floating button.
15. **❌ MISSING: mobile filter chip row under tabs (Season/Color, no category).** Loveable: `Profile.tsx:316-366`. Staging: no mobile filter. Action: add `lg:hidden` chip row.
16. **❌ MISSING: real images on Looks grid.** (See #9; double-counted by source — keep #9 as the canonical.)
17. **❌ MISSING: ClosetItemDialog detail modal.** Loveable: `ClosetItemDialog.tsx:1-150` — image, brand, name, specs (color/size/material/season), outfits-using, Share/Download/Edit/Delete actions. Staging: none. Action: implement modal that opens on item tile click.
18. **⚠️ COPY MISMATCH on collections empty-state.** Staging: `profile/client.tsx:309-311` "No collections yet. Create one to group items by occasion or season." Loveable: verify exact copy and match verbatim.

---

## /favorites — 8 gaps

1. **⚠️ TAB DRIFT: staging has 3 tabs (Looks/Items/Stylists); Loveable has 2 (Looks/Stylists).** Loveable: `Favorites.tsx:50-58`. Staging: `favorites/page.tsx:36-41`. Action: confirm with founder whether Items tab is intentional Wishi addition; if so, document; if not, remove.
2. **❌ MISSING: hover-reveal filled-heart unfavorite button on look cards.** Loveable: `Favorites.tsx:75-80`. Staging: links only (`favorites/page.tsx:43-64`). Action: add hover-revealed remove control.
3. **❌ MISSING: `group-hover:scale-105` on look-card image.** Loveable: `Favorites.tsx:65-89`. Staging: `hover:shadow-md` only. Action: add scale transform.
4. **⚠️ DATA SHAPE DRIFT: looks `{description, savedDate, stylist}` vs `{title, boardId, sessionId}`.** Action: align rendering — use Board fields for description / saved date / stylist.
5. **⚠️ ITEMS TAB STAGING-ONLY (see #1).** Action depends on #1.
6. **❌ MISSING: stylist portfolio image (4:3) on stylist favorite card.** Loveable: `Favorites.tsx:114-122`. Staging: blank. Action: render portfolio cover image.
7. **❌ MISSING: stylist meta block (avatar + name + location + specialty).** Loveable: `Favorites.tsx:130-142`. Action: render all four fields.
8. **⚠️ CTA LABEL DRIFT: stylist card button.** Loveable: `Favorites.tsx:145-148` "View Profile". Staging: verify and match verbatim.

---

## /collections — structural divergence + 5 gaps

**Structural:** Loveable has Collections as a TAB inside `/profile`; staging hoisted to `/collections/[id]`. Decision: keep both — in-profile preview + standalone detail.

1. **⚠️ NO TOP-LEVEL `/collections` INDEX IN LOVEABLE.** Staging only has `/collections/[id]`. If a top-level page exists in staging, evaluate.
2. **❌ MISSING: CreateCollectionDialog + CollectionDetailDialog.** Loveable: `CollectionManager.tsx:32-165` and `:179-245`. Staging: verify both dialogs exist or implement.
3. **⚠️ COLLECTION PREVIEW LAYOUT.** 4×1 (Loveable) vs 2×2 (staging). Action: switch to 4×1.
4. **❌ MISSING: Edit + Delete actions in collection detail (Pencil + Trash2 icons).** Loveable: `CollectionDetailDialog.tsx:199-216`. Action: ensure detail UI has both buttons in header.
5. **❌ MISSING: hover-X to remove item from collection.** Loveable: `CollectionDetailDialog.tsx:226-238`. Action: add hover-X overlay.

---

## /orders — 11 gaps

1. **⚠️ TITLE/SUBTITLE COPY: verify "My Orders" + Loveable's lede vs staging's return-window lede.** Loveable: `Orders.tsx:316`. Staging: `orders/page.tsx:17`. Action: match Loveable verbatim or document deviation.
2. **⚠️ TAB COUNTS: All / Active / Past with counts.** Both have tabs (`Orders.tsx:318-329` vs `orders-list.tsx:192-197`). Action: verify count math matches Loveable.
3. **⚠️ SUMMARY-CARD META columns: Date / Order No. / Order Total left column.** Loveable: `Orders.tsx:179-205`. Staging: `orders-list.tsx:103-127`. Action: verify font/color tokens match.
4. **❌ MISSING: 3 thumbnails + "+X more" in summary.** Loveable: `Orders.tsx:207-217`. Staging: none. Action: render thumbnails row.
5. **❌ MISSING: "Order Details" link with ChevronRight on right side.** Loveable: `Orders.tsx:220-226`. Staging: implicit expand. Action: add explicit link.
6. **❌ MISSING: TrackingProgress component (Processing → Shipped → Delivered).** Loveable: `Orders.tsx:110-144`. Staging: status badge only. Action: implement step indicator for active orders.
7. **❌ MISSING: expanded panel `border-t border-border bg-muted/20`.** Loveable: `Orders.tsx:234-305`. Staging: verify and apply.
8. **❌ MISSING: tracking number row when status === shipped.** Loveable: `Orders.tsx:237-241`. Action: add to expanded detail.
9. **❌ MISSING: detailed item row (image + brand/name/specs/price + Add-to-Closet / Start-Return / Return-requested status).** Loveable: `Orders.tsx:245-296`. Staging: `orders-list.tsx:129-176` partial. Action: full row port.
10. **❌ MISSING: order footer "N items · Ordered DATE" left + "Total: $X" right.** Loveable: `Orders.tsx:299-304`. Action: add footer.
11. **⚠️ EMPTY STATE COPY: "No active orders" / "No past orders yet".** Loveable: `Orders.tsx:340, :350`. Action: match verbatim.

---

**Total: 42 verified gaps across the 4 surfaces.**
