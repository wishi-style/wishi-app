import assert from "node:assert/strict";
import test from "node:test";
import {
  LOVEABLE_COLORS,
  aggregateBudgetBrackets,
  expandLikedColors,
  formatPhone,
  loveableQuizAnswersSchema,
  mapComfortZone,
  mapFit,
  mapHearAbout,
  mapHeight,
  mapShoppingReason,
  mapTendToWear,
  mapWorkEnvironment,
  mergeStyleIcons,
  parseBudgetBracket,
} from "@/lib/quiz/loveable-style-quiz";

// Minimum-viable answers — only the two required fields filled; every
// optional array is empty. Mirrors what the UI sends if the user picks a
// shopping reason + at least one piece and skips the rest.
function minimalAnswers() {
  return {
    shoppingFor: "A holiday" as const,
    pieces: ["Tops"] as const,
    selectedColors: [],
    selectedPatterns: [],
    sizeTops: [],
    sizeBottoms: [],
    sizeShoes: [],
    sizeJeans: [],
    sizeDresses: [],
    sizeOuterwear: [],
    budgetTops: [],
    budgetBottoms: [],
    budgetShoes: [],
    budgetJewelry: [],
    budgetAccessories: [],
    accentuate: [],
    necklinesAvoid: [],
    bodyAreas: [],
    materialsAvoid: [],
    styleIcons: [],
    values: [],
  };
}

test("mapShoppingReason translates every Loveable label to a ShoppingReason enum", () => {
  assert.equal(mapShoppingReason("A special event"), "SPECIAL_EVENT");
  assert.equal(mapShoppingReason("A workwear update"), "WORKWEAR_UPDATE");
  assert.equal(mapShoppingReason("A holiday"), "HOLIDAY");
  assert.equal(mapShoppingReason("A style refresh"), "STYLE_REFRESH");
  assert.equal(mapShoppingReason("A particular piece"), "PARTICULAR_PIECE");
});

test("mapWorkEnvironment maps the 4 Loveable workwear sub-question labels", () => {
  assert.equal(mapWorkEnvironment("Corporate"), "CORPORATE");
  assert.equal(mapWorkEnvironment("Denim friendly"), "DENIM_FRIENDLY");
  assert.equal(mapWorkEnvironment("Anything goes"), "ANYTHING_GOES");
  assert.equal(mapWorkEnvironment("Other"), "OTHER");
});

test("mapHeight uppercases Loveable's height labels into HeightCategory", () => {
  assert.equal(mapHeight("Tall"), "TALL");
  assert.equal(mapHeight("Average"), "AVERAGE");
  assert.equal(mapHeight("Petite"), "PETITE");
});

test("mapTendToWear collapses the 3 Loveable labels onto TendToWear", () => {
  assert.equal(mapTendToWear("Mostly dresses and skirts"), "MOSTLY_DRESSES");
  assert.equal(mapTendToWear("Mostly jeans and pants"), "MOSTLY_PANTS");
  assert.equal(mapTendToWear("Healthy mix of both"), "MIX");
});

test("mapComfortZone uses Loveable's exact phrasing", () => {
  assert.equal(mapComfortZone("Stay close to my style"), "STAY_CLOSE");
  assert.equal(mapComfortZone("Open for a few new items"), "FEW_NEW_ITEMS");
  assert.equal(mapComfortZone("Up for a new style"), "NEW_STYLE");
});

test("mapFit uppercases the 5 Loveable fit ladder labels", () => {
  assert.equal(mapFit("Tight"), "TIGHT");
  assert.equal(mapFit("Fitted"), "FITTED");
  assert.equal(mapFit("Straight"), "STRAIGHT");
  assert.equal(mapFit("Loose"), "LOOSE");
  assert.equal(mapFit("Oversized"), "OVERSIZED");
});

test("mapHearAbout handles every Loveable referral source — including punctuated labels", () => {
  assert.equal(mapHearAbout("Instagram"), "INSTAGRAM");
  assert.equal(mapHearAbout("Referred by a stylist"), "REFERRED_BY_STYLIST");
  assert.equal(mapHearAbout("Family / Friend"), "FRIEND_FAMILY");
  assert.equal(mapHearAbout("Internet Search"), "INTERNET_SEARCH");
  assert.equal(mapHearAbout("Article / Media"), "ARTICLE_MEDIA");
  assert.equal(mapHearAbout("Pinterest"), "PINTEREST");
  assert.equal(mapHearAbout("Facebook"), "FACEBOOK");
  assert.equal(mapHearAbout("Newsletter"), "NEWSLETTER");
  assert.equal(mapHearAbout("I'm a Repeat Customer"), "REPEAT_CUSTOMER");
  assert.equal(mapHearAbout("Other"), "OTHER");
});

test("parseBudgetBracket converts Loveable's dollar strings to cents ranges", () => {
  assert.deepEqual(parseBudgetBracket("$50–100"), { minInCents: 5000, maxInCents: 10000 });
  assert.deepEqual(parseBudgetBracket("$100–250"), { minInCents: 10000, maxInCents: 25000 });
  assert.deepEqual(parseBudgetBracket("$1000+"), { minInCents: 100000, maxInCents: 1000000 });
});

test("aggregateBudgetBrackets unions the widest min/max across picks", () => {
  assert.equal(aggregateBudgetBrackets([]), null);
  assert.deepEqual(aggregateBudgetBrackets(["$50–100"]), { minInCents: 5000, maxInCents: 10000 });
  // Disjoint pick → widen
  assert.deepEqual(aggregateBudgetBrackets(["$100–250", "$500–1000"]), {
    minInCents: 10000,
    maxInCents: 100000,
  });
});

test('expandLikedColors fans "Anything Goes" out to every base color', () => {
  // No Anything Goes → pass-through
  assert.deepEqual(expandLikedColors(["Black", "Pink"]), ["Black", "Pink"]);
  // Anything Goes → every base color (14 of them — "Anything Goes" itself is stripped)
  const expanded = expandLikedColors(["Anything Goes"]);
  assert.equal(expanded.length, LOVEABLE_COLORS.length);
  for (const c of LOVEABLE_COLORS) assert.ok(expanded.includes(c));
});

test("mergeStyleIcons combines curated picks with freeform 'Anything else?' text, dedupes", () => {
  assert.deepEqual(mergeStyleIcons(["Beyonce"], "Kate Moss, Beyonce"), [
    "Beyonce",
    "Kate Moss",
  ]);
  // Newline-separated extras
  assert.deepEqual(mergeStyleIcons([], "Audrey\nGrace Kelly;Diana"), [
    "Audrey",
    "Grace Kelly",
    "Diana",
  ]);
  // Empty other
  assert.deepEqual(mergeStyleIcons(["Beyonce"], ""), ["Beyonce"]);
});

test("formatPhone joins country code + number, returns null for empty input", () => {
  assert.equal(formatPhone("+1", "5551234567"), "+1 5551234567");
  assert.equal(formatPhone(undefined, "5551234567"), "+1 5551234567");
  assert.equal(formatPhone("+44", "  207 1234 5678  "), "+44 207 1234 5678");
  assert.equal(formatPhone("+1", ""), null);
  assert.equal(formatPhone("+1", undefined), null);
});

// =====================================================================
// loveableQuizAnswersSchema — server-side validation contract
// =====================================================================

test("schema accepts a minimal payload (required fields only)", () => {
  const result = loveableQuizAnswersSchema.safeParse(minimalAnswers());
  assert.equal(result.success, true);
});

test("schema rejects an unknown shoppingFor value", () => {
  const bad = { ...minimalAnswers(), shoppingFor: "Not a real reason" };
  const result = loveableQuizAnswersSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test("schema rejects an empty pieces array (step 1 is required)", () => {
  const bad = { ...minimalAnswers(), pieces: [] };
  const result = loveableQuizAnswersSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test("schema rejects an unknown piece in the pieces array", () => {
  const bad = { ...minimalAnswers(), pieces: ["Tops", "Not a real piece"] };
  const result = loveableQuizAnswersSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test("schema rejects an unknown comfortZone phrase", () => {
  const bad = { ...minimalAnswers(), comfortZone: "Burn it all down" };
  const result = loveableQuizAnswersSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test('schema accepts "Anything Goes" sentinel in selectedColors', () => {
  const ok = { ...minimalAnswers(), selectedColors: ["Anything Goes" as const] };
  const result = loveableQuizAnswersSchema.safeParse(ok);
  assert.equal(result.success, true);
});

test("schema rejects bodyPhotoUrl that doesn't point at our image proxy", () => {
  const bad = { ...minimalAnswers(), bodyPhotoUrl: "https://evil.example.com/x.jpg" };
  const result = loveableQuizAnswersSchema.safeParse(bad);
  assert.equal(result.success, false);
});

test("schema accepts bodyPhotoUrl under /api/images/style-quiz/", () => {
  const ok = {
    ...minimalAnswers(),
    bodyPhotoUrl: "/api/images/style-quiz/user_123/body-photo/1234567890-photo.jpg",
  };
  const result = loveableQuizAnswersSchema.safeParse(ok);
  assert.equal(result.success, true);
});
