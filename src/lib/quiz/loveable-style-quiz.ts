// Shape of Loveable's `/style-quiz` form state (smart-spark-craft/src/pages/StyleQuiz.tsx).
// Every step's answer is captured here verbatim — the server action does
// option-string → enum translation in one place so the client component
// can stay a near-verbatim port of Loveable's JSX.

import type {
  ComfortZone,
  HearAboutSource,
  HeightCategory,
  ShoppingReason,
  TendToWear,
  WorkEnvironment,
  FitPreference,
  BudgetCategory,
} from "@/generated/prisma/client";

/** Loveable step 0 — single-select. */
export const LOVEABLE_SHOPPING_REASONS = [
  "A special event",
  "A workwear update",
  "A holiday",
  "A style refresh",
  "A particular piece",
] as const;
export type LoveableShoppingReason = (typeof LOVEABLE_SHOPPING_REASONS)[number];

/** Loveable step 0b conditional sub-question. */
export const LOVEABLE_WORK_ENVIRONMENTS = [
  "Corporate",
  "Denim friendly",
  "Anything goes",
  "Other",
] as const;
export type LoveableWorkEnvironment = (typeof LOVEABLE_WORK_ENVIRONMENTS)[number];

/** Step 1. */
export const LOVEABLE_PIECES = [
  "Tops",
  "Pants",
  "Jackets",
  "Jumpsuits",
  "Sweaters",
  "Sunglasses",
  "Shoes",
  "Skirts",
  "Dresses",
  "Jeans",
  "Blazers",
  "Coats",
  "Scarves",
  "Jewelry",
  "Hats",
  "Bags",
] as const;
export type LoveablePiece = (typeof LOVEABLE_PIECES)[number];

/** Step 2 — note "Anything Goes" is a synthetic selector that expands to all. */
export const LOVEABLE_COLORS = [
  "Black",
  "White",
  "Gray",
  "Navy Blue",
  "Light Blue",
  "Green",
  "Natural",
  "Brown",
  "Red",
  "Yellow",
  "Pink",
  "Orange",
  "Purple",
  "Metallic",
] as const;
export type LoveableColor = (typeof LOVEABLE_COLORS)[number] | "Anything Goes";

/** Step 4. */
export const LOVEABLE_PATTERNS = [
  "Animal Print",
  "Paisley",
  "Camo",
  "Plaid",
  "Polka Dots",
  "Stripes",
  "Floral",
] as const;
export type LoveablePattern = (typeof LOVEABLE_PATTERNS)[number];

/** Step 5. */
export const LOVEABLE_HEIGHTS = ["Tall", "Average", "Petite"] as const;
export type LoveableHeight = (typeof LOVEABLE_HEIGHTS)[number];

/** Step 6 — per-category size matrices. */
export const LOVEABLE_TOP_BOTTOM_SIZES = [
  "Extra small",
  "Small",
  "Medium",
  "Large",
  "Extra large",
] as const;
export const LOVEABLE_SHOE_SIZES = [
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
] as const;
export const LOVEABLE_JEANS_SIZES = [
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
] as const;

/** Step 7. */
export const LOVEABLE_BUDGET_BRACKETS = [
  "$50–100",
  "$100–250",
  "$250–500",
  "$500–1000",
  "$1000+",
] as const;
export type LoveableBudgetBracket = (typeof LOVEABLE_BUDGET_BRACKETS)[number];

/** Steps 8 + 9 — 5-level fit ladder. */
export const LOVEABLE_FITS = ["Tight", "Fitted", "Straight", "Loose", "Oversized"] as const;
export type LoveableFit = (typeof LOVEABLE_FITS)[number];

/** Step 10. */
export const LOVEABLE_TEND_TO_WEAR = [
  "Mostly dresses and skirts",
  "Mostly jeans and pants",
  "Healthy mix of both",
] as const;
export type LoveableTendToWear = (typeof LOVEABLE_TEND_TO_WEAR)[number];

/** Step 11. */
export const LOVEABLE_ACCENTUATE = [
  "Abs",
  "Arms",
  "Back",
  "Calves",
  "Cleavage",
  "Legs",
  "Rear",
  "Waist",
] as const;
export type LoveableAccentuate = (typeof LOVEABLE_ACCENTUATE)[number];

/** Step 12. */
export const LOVEABLE_NECKLINES_AVOID = [
  "V neck",
  "Halter neck",
  "Turtle neck",
  "Deep V",
  "Round neck",
  "Strapless",
  "Sleeveless",
  "Boat neck",
  "Cowl neck",
] as const;
export type LoveableNecklineAvoid = (typeof LOVEABLE_NECKLINES_AVOID)[number];

/** Step 13. */
export const LOVEABLE_BODY_AREAS = [
  "Arms/Shoulders",
  "Stomach",
  "Rear",
  "Hips",
  "Legs",
  "Chest",
  "Feet",
  "Health Concerns",
  "Something else",
] as const;
export type LoveableBodyArea = (typeof LOVEABLE_BODY_AREAS)[number];

/** Step 14. */
export const LOVEABLE_MATERIALS_AVOID = [
  "Velvet",
  "Leather",
  "Lace",
  "Polyester",
  "Fur",
  "Wool",
  "Dry Clean Only",
  "Linen",
] as const;
export type LoveableMaterialAvoid = (typeof LOVEABLE_MATERIALS_AVOID)[number];

/** Step 15. */
export const LOVEABLE_COMFORT_ZONES = [
  "Stay close to my style",
  "Open for a few new items",
  "Up for a new style",
] as const;
export type LoveableComfortZone = (typeof LOVEABLE_COMFORT_ZONES)[number];

/** Step 18 — curated 54-icon list (verbatim Loveable). */
export const LOVEABLE_STYLE_ICONS = [
  "Beyonce",
  "Reese Witherspoon",
  "Carolyn Bessette-Kennedy",
  "Kaia Gerber",
  "Lilly Aldridge",
  "Diane Kruger",
  "Priyanka Chopra-Jonas",
  "Rosie Huntington-Whiteley",
  "Alessandra Ambrosio",
  "Amal Clooney",
  "Hailey Bieber",
  "Jackie Kennedy",
  "Angelina Jolie",
  "Annie Bing",
  "Ashley Benson",
  "Ashley Graham",
  "Ashley Olsen",
  "Audrey Hepburn",
  "Aya Jones",
  "Bianca Brandolini",
  "Bree Warren",
  "Brittany Xavier",
  "Olivia Palermo",
  "Elsa Hosk",
  "Emily Ratajkowski",
  "Eva Mendes",
  "Gwyneth Paltrow",
  "Amanda Harlech",
  "Irina Shayk",
  "Angelica Blick",
  "Jane Birkin",
  "Jennifer Aniston",
  "Jennifer Lopez",
  "Karlie Kloss",
  "Kate Middleton",
  "Kate Moss",
  "Khloe Kardashian",
  "Kim Kardashian",
  "Lauren Santo Domingo",
  "Leandra Medine",
  "Michelle Obama",
  "Naomi Watts",
  "Nicole Kidman",
  "Olivia Wilde",
  "Cindy Crawford",
  "Rihanna",
  "Victoria Beckham",
  "Zoe Kravitz",
  "Eva Chen",
  "Meghan Markle",
  "Lily Collins",
  "Chloe Sevigny",
  "Chrissy Teigen",
] as const;
export type LoveableStyleIcon = (typeof LOVEABLE_STYLE_ICONS)[number];

/** Step 21. */
export const LOVEABLE_SHOPPING_VALUES = [
  "Quiet Luxury",
  "Uniqueness",
  "Sustainability",
  "Versatility",
  "Comfort",
  "The latest trends",
] as const;
export type LoveableShoppingValue = (typeof LOVEABLE_SHOPPING_VALUES)[number];

/** Step 23. */
export const LOVEABLE_HEAR_ABOUT = [
  "Instagram",
  "Referred by a stylist",
  "Family / Friend",
  "Internet Search",
  "Article / Media",
  "Pinterest",
  "Facebook",
  "Newsletter",
  "I'm a Repeat Customer",
  "Other",
] as const;
export type LoveableHearAbout = (typeof LOVEABLE_HEAR_ABOUT)[number];

/** Step 24 — supported dial codes. */
export const LOVEABLE_COUNTRY_CODES = [
  "+1",
  "+44",
  "+972",
  "+61",
  "+33",
  "+49",
  "+39",
  "+34",
  "+81",
  "+86",
  "+91",
  "+55",
  "+52",
] as const;
export type LoveableCountryCode = (typeof LOVEABLE_COUNTRY_CODES)[number];

/**
 * Whole-form state. Optional fields are skipped Loveable steps; required
 * (step 0 + step 1) must be present for the form to advance past those
 * steps in the UI.
 */
export interface LoveableQuizAnswers {
  shoppingFor: LoveableShoppingReason;
  workEnvironment?: LoveableWorkEnvironment | null;
  workEnvironmentOther?: string;
  pieces: LoveablePiece[];
  selectedColors: LoveableColor[];
  location?: string;
  selectedPatterns: LoveablePattern[];
  heightPreference?: LoveableHeight | null;
  sizeTops: string[];
  sizeBottoms: string[];
  sizeShoes: string[];
  sizeJeans: string[];
  sizeDresses: string[];
  sizeOuterwear: string[];
  budgetTops: LoveableBudgetBracket[];
  budgetBottoms: LoveableBudgetBracket[];
  budgetShoes: LoveableBudgetBracket[];
  budgetJewelry: LoveableBudgetBracket[];
  budgetAccessories: LoveableBudgetBracket[];
  fitPreference?: LoveableFit | null;
  fitBottomPreference?: LoveableFit | null;
  tendToWear?: LoveableTendToWear | null;
  accentuate: LoveableAccentuate[];
  necklinesAvoid: LoveableNecklineAvoid[];
  bodyAreas: LoveableBodyArea[];
  bodyAreasNotes?: string;
  materialsAvoid: LoveableMaterialAvoid[];
  comfortZone?: LoveableComfortZone | null;
  birthday?: string; // YYYY-MM-DD
  occupation?: string;
  styleIcons: LoveableStyleIcon[];
  styleIconsOther?: string;
  instagram?: string;
  pinterest?: string;
  values: LoveableShoppingValue[];
  extraNotes?: string;
  bodyPhotoUrl?: string | null;
  hearAboutUs?: LoveableHearAbout | null;
  hearAboutUsOther?: string;
  phoneCountryCode?: LoveableCountryCode;
  phoneNumber?: string;
  preferredEmail?: string;
}

// =====================================================================
// Loveable string → Prisma enum mappers
// =====================================================================

export function mapShoppingReason(v: LoveableShoppingReason): ShoppingReason {
  switch (v) {
    case "A special event":
      return "SPECIAL_EVENT";
    case "A workwear update":
      return "WORKWEAR_UPDATE";
    case "A holiday":
      return "HOLIDAY";
    case "A style refresh":
      return "STYLE_REFRESH";
    case "A particular piece":
      return "PARTICULAR_PIECE";
  }
}

export function mapWorkEnvironment(v: LoveableWorkEnvironment): WorkEnvironment {
  switch (v) {
    case "Corporate":
      return "CORPORATE";
    case "Denim friendly":
      return "DENIM_FRIENDLY";
    case "Anything goes":
      return "ANYTHING_GOES";
    case "Other":
      return "OTHER";
  }
}

export function mapHeight(v: LoveableHeight): HeightCategory {
  return v.toUpperCase() as HeightCategory;
}

export function mapTendToWear(v: LoveableTendToWear): TendToWear {
  switch (v) {
    case "Mostly dresses and skirts":
      return "MOSTLY_DRESSES";
    case "Mostly jeans and pants":
      return "MOSTLY_PANTS";
    case "Healthy mix of both":
      return "MIX";
  }
}

export function mapComfortZone(v: LoveableComfortZone): ComfortZone {
  switch (v) {
    case "Stay close to my style":
      return "STAY_CLOSE";
    case "Open for a few new items":
      return "FEW_NEW_ITEMS";
    case "Up for a new style":
      return "NEW_STYLE";
  }
}

export function mapFit(v: LoveableFit): FitPreference {
  return v.toUpperCase() as FitPreference;
}

export function mapHearAbout(v: LoveableHearAbout): HearAboutSource {
  switch (v) {
    case "Instagram":
      return "INSTAGRAM";
    case "Referred by a stylist":
      return "REFERRED_BY_STYLIST";
    case "Family / Friend":
      return "FRIEND_FAMILY";
    case "Internet Search":
      return "INTERNET_SEARCH";
    case "Article / Media":
      return "ARTICLE_MEDIA";
    case "Pinterest":
      return "PINTEREST";
    case "Facebook":
      return "FACEBOOK";
    case "Newsletter":
      return "NEWSLETTER";
    case "I'm a Repeat Customer":
      return "REPEAT_CUSTOMER";
    case "Other":
      return "OTHER";
  }
}

/**
 * Loveable budget bracket → cents range. `$1000+` open-ends; we use the
 * convention `min=100000, max=null` ... but the existing BudgetByCategory
 * schema has non-null maxInCents. Cap to a generous ceiling.
 */
export function parseBudgetBracket(b: LoveableBudgetBracket): {
  minInCents: number;
  maxInCents: number;
} {
  switch (b) {
    case "$50–100":
      return { minInCents: 5000, maxInCents: 10000 };
    case "$100–250":
      return { minInCents: 10000, maxInCents: 25000 };
    case "$250–500":
      return { minInCents: 25000, maxInCents: 50000 };
    case "$500–1000":
      return { minInCents: 50000, maxInCents: 100000 };
    case "$1000+":
      return { minInCents: 100000, maxInCents: 1000000 };
  }
}

/**
 * Pick the *widest* range across selected brackets. If a client checks both
 * `$100–250` and `$500–1000` we store min=10000, max=100000 so downstream
 * matching sees the inclusive window.
 */
export function aggregateBudgetBrackets(
  picks: LoveableBudgetBracket[],
): { minInCents: number; maxInCents: number } | null {
  if (picks.length === 0) return null;
  const ranges = picks.map(parseBudgetBracket);
  return {
    minInCents: Math.min(...ranges.map((r) => r.minInCents)),
    maxInCents: Math.max(...ranges.map((r) => r.maxInCents)),
  };
}

export const BUDGET_CATEGORY_KEYS: Record<
  "Tops" | "Bottoms" | "Shoes" | "Jewelry" | "Accessories",
  BudgetCategory
> = {
  Tops: "TOPS",
  Bottoms: "BOTTOMS",
  Shoes: "SHOES",
  Jewelry: "JEWELRY",
  Accessories: "ACCESSORIES",
};

/** Resolve "Anything Goes" → every base color; pass-through otherwise. */
export function expandLikedColors(picks: LoveableColor[]): string[] {
  if (picks.includes("Anything Goes")) {
    return [...LOVEABLE_COLORS];
  }
  return picks.filter((p): p is (typeof LOVEABLE_COLORS)[number] => p !== "Anything Goes");
}

/** Merge curated icons + freeform "Anything else?" textarea; split + dedupe. */
export function mergeStyleIcons(picks: LoveableStyleIcon[], other?: string): string[] {
  const extras = (other ?? "")
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...picks, ...extras]));
}

/** Format Loveable's `+1` + `5551234567` into a single phone string. */
export function formatPhone(countryCode: string | undefined, number: string | undefined): string | null {
  if (!number || !number.trim()) return null;
  const code = countryCode ?? "+1";
  return `${code} ${number.trim()}`;
}
