"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/s3";
import { revalidatePath } from "next/cache";
import { Gender, FitPreference } from "@/generated/prisma/client";

export async function confirmAvatarUpload(s3Key: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const avatarUrl = getPublicUrl(s3Key);

  await prisma.user.update({
    where: { clerkId },
    data: { avatarUrl },
  });

  revalidatePath("/settings");
}

const VALID_GENDERS = new Set<Gender>([
  "FEMALE",
  "MALE",
  "NON_BINARY",
  "PREFER_NOT_TO_SAY",
]);

function nullable(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseGender(v: FormDataEntryValue | null): Gender | null {
  const s = nullable(v);
  if (!s) return null;
  return VALID_GENDERS.has(s as Gender) ? (s as Gender) : null;
}

function parseBirthday(v: FormDataEntryValue | null): Date | null {
  const s = nullable(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "New York, NY" → { city: "New York", state: "NY" }; bare "Paris" → city. */
function parseLocation(
  v: FormDataEntryValue | null,
): { city: string | null; state: string | null } | null {
  const s = nullable(v);
  if (!s) return null;
  const [cityRaw, stateRaw] = s.split(",").map((p) => p.trim());
  return { city: cityRaw || null, state: stateRaw || null };
}

export async function updateProfile(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) throw new Error("Unauthorized");

  const firstName = nullable(formData.get("firstName"));
  const lastName = nullable(formData.get("lastName"));
  const phone = formData.get("phone");
  const phoneNorm =
    typeof phone === "string" ? (phone.trim() ? phone.trim() : null) : undefined;
  const birthday = parseBirthday(formData.get("birthday"));
  const gender = parseGender(formData.get("gender"));
  const height = nullable(formData.get("height"));
  const bodyType = nullable(formData.get("bodyType"));
  const occupation = nullable(formData.get("occupation"));
  const instagram = nullable(formData.get("instagram"));
  const pinterest = nullable(formData.get("pinterest"));
  const location = parseLocation(formData.get("location"));

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(phoneNorm !== undefined ? { phone: phoneNorm } : {}),
        ...(formData.has("birthday") ? { birthday } : {}),
        ...(formData.has("gender") ? { gender } : {}),
      },
    });

    if (formData.has("height") || formData.has("bodyType")) {
      await tx.bodyProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          height: height ?? undefined,
          bodyType: bodyType ?? undefined,
        },
        update: {
          ...(formData.has("height") ? { height } : {}),
          ...(formData.has("bodyType") ? { bodyType } : {}),
        },
      });
    }

    if (formData.has("occupation")) {
      await tx.styleProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          occupation: occupation ?? undefined,
          stylePreferences: [],
          styleIcons: [],
        },
        update: { occupation },
      });
    }

    if (formData.has("location")) {
      const existing = await tx.userLocation.findFirst({
        where: { userId: user.id, isPrimary: true },
        select: { id: true },
      });
      if (location) {
        if (existing) {
          await tx.userLocation.update({
            where: { id: existing.id },
            data: { city: location.city, state: location.state },
          });
        } else {
          await tx.userLocation.create({
            data: {
              userId: user.id,
              city: location.city,
              state: location.state,
              isPrimary: true,
            },
          });
        }
      } else if (existing) {
        await tx.userLocation.delete({ where: { id: existing.id } });
      }
    }

    for (const platform of ["instagram", "pinterest"] as const) {
      if (!formData.has(platform)) continue;
      const value = platform === "instagram" ? instagram : pinterest;
      const existing = await tx.userSocialLink.findFirst({
        where: { userId: user.id, platform },
        select: { id: true },
      });
      if (value) {
        if (existing) {
          await tx.userSocialLink.update({
            where: { id: existing.id },
            data: { url: value },
          });
        } else {
          await tx.userSocialLink.create({
            data: { userId: user.id, platform, url: value },
          });
        }
      } else if (existing) {
        await tx.userSocialLink.delete({ where: { id: existing.id } });
      }
    }
  });

  revalidatePath("/settings");
}

const VALID_FIT: ReadonlySet<FitPreference> = new Set([
  "SLIM",
  "REGULAR",
  "RELAXED",
  "OVERSIZED",
]);
const FIT_LOOKUP: Record<string, FitPreference> = {
  slim: "SLIM",
  fitted: "SLIM",
  regular: "REGULAR",
  straight: "REGULAR",
  relaxed: "RELAXED",
  loose: "RELAXED",
  oversized: "OVERSIZED",
};

function parseFit(v: FormDataEntryValue | null): FitPreference | null {
  const s = nullable(v);
  if (!s) return null;
  const upper = s.toUpperCase();
  if (VALID_FIT.has(upper as FitPreference)) return upper as FitPreference;
  return FIT_LOOKUP[s.toLowerCase()] ?? null;
}

function parseList(v: FormDataEntryValue | null): string[] {
  const s = nullable(v);
  if (!s) return [];
  return s
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function parseBudget(
  v: FormDataEntryValue | null,
): { minInCents: number; maxInCents: number } | null {
  const s = nullable(v);
  if (!s) return null;
  const match = s.match(/\$?\s*(\d+)\s*[–\-]\s*\$?\s*(\d+)/);
  if (!match) return null;
  return {
    minInCents: parseInt(match[1], 10) * 100,
    maxInCents: parseInt(match[2], 10) * 100,
  };
}

function parseComfortZone(v: FormDataEntryValue | null): number | null {
  const s = nullable(v);
  if (!s) return null;
  if (s === "Stay close") return 2;
  if (s === "A little outside") return 5;
  if (s === "Push my boundaries") return 9;
  return null;
}

const SIZE_CATEGORIES = [
  "TOPS",
  "BOTTOMS",
  "JEANS",
  "DRESSES",
  "OUTERWEAR",
  "SHOES",
] as const;
type SizeCategory = (typeof SIZE_CATEGORIES)[number];

const BUDGET_CATEGORIES = [
  "TOPS",
  "BOTTOMS",
  "SHOES",
  "JEWELRY",
  "ACCESSORIES",
] as const;
type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];

export async function updateStyleInfo(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) throw new Error("Unauthorized");

  // Goals & lifestyle (StyleProfile)
  const shoppingFor = nullable(formData.get("shoppingFor"));
  const workEnvironment = nullable(formData.get("workEnvironment"));
  const occupation = nullable(formData.get("occupation"));
  const location = parseLocation(formData.get("location"));
  // Pieces & categories
  const piecesNeeded = parseList(formData.get("piecesNeeded"));
  // Fit & body (BodyProfile)
  const height = nullable(formData.get("height"));
  const bodyType = nullable(formData.get("bodyType"));
  const fitTops = parseFit(formData.get("fitTops"));
  const fitBottoms = parseFit(formData.get("fitBottoms"));
  const tendToWear = nullable(formData.get("tendToWear"));
  const accentuate = parseList(formData.get("accentuate"));
  const necklinesAvoid = parseList(formData.get("necklinesAvoid"));
  const bodyAreasMindful = parseList(formData.get("bodyAreasMindful"));
  const bodyAreasNotes = nullable(formData.get("bodyAreasNotes"));
  // Style preferences
  const styleKeywords = parseList(formData.get("styleKeywords"));
  const favoriteColors = parseList(formData.get("favoriteColors"));
  const avoidColors = parseList(formData.get("avoidColors"));
  const favoritePatterns = parseList(formData.get("favoritePatterns"));
  const materialsAvoid = parseList(formData.get("materialsAvoid"));
  const comfortZoneLevel = parseComfortZone(formData.get("comfortZone"));
  const shoppingValues = parseList(formData.get("shoppingValues"));
  // Inspiration
  const styleIcons = parseList(formData.get("styleIcons"));
  const instagram = nullable(formData.get("instagram"));
  const pinterest = nullable(formData.get("pinterest"));
  // Brands
  const preferredBrands = parseList(formData.get("preferredBrands"));
  const avoidBrands = parseList(formData.get("avoidBrands"));
  // Occasions & notes
  const occasions = parseList(formData.get("occasions"));
  const notes = nullable(formData.get("notes"));

  await prisma.$transaction(async (tx) => {
    // StyleProfile — most string + array columns
    await tx.styleProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        stylePreferences: styleKeywords,
        styleIcons,
        comfortZoneLevel: comfortZoneLevel ?? undefined,
        dressCode: workEnvironment ?? undefined,
        occupation: occupation ?? undefined,
        typicallyWears: tendToWear ?? undefined,
        needsDescription: shoppingFor ?? undefined,
        piecesNeeded,
        preferredBrands,
        avoidBrands,
        occasions,
        notes: notes ?? undefined,
        shoppingValues,
      },
      update: {
        stylePreferences: styleKeywords,
        styleIcons,
        comfortZoneLevel,
        dressCode: workEnvironment,
        occupation,
        typicallyWears: tendToWear,
        needsDescription: shoppingFor,
        piecesNeeded,
        preferredBrands,
        avoidBrands,
        occasions,
        notes,
        shoppingValues,
      },
    });

    // BodyProfile — fit, height, body type + array columns + bodyIssues notes
    await tx.bodyProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        height: height ?? undefined,
        bodyType: bodyType ?? undefined,
        topFit: fitTops ?? undefined,
        bottomFit: fitBottoms ?? undefined,
        highlightAreas: accentuate,
        necklinesAvoid,
        bodyAreasMindful,
        bodyIssues: bodyAreasNotes ?? undefined,
      },
      update: {
        height,
        bodyType,
        topFit: fitTops,
        bottomFit: fitBottoms,
        highlightAreas: accentuate,
        necklinesAvoid,
        bodyAreasMindful,
        bodyIssues: bodyAreasNotes,
      },
    });

    // Sizes — replace BodySize rows by category
    const bodyProfile = await tx.bodyProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (bodyProfile) {
      for (const cat of SIZE_CATEGORIES) {
        const fieldKey = sizeFormFieldKey(cat);
        if (!formData.has(fieldKey)) continue;
        const value = nullable(formData.get(fieldKey));
        await tx.bodySize.deleteMany({
          where: { bodyProfileId: bodyProfile.id, category: cat },
        });
        if (value) {
          await tx.bodySize.create({
            data: {
              bodyProfileId: bodyProfile.id,
              category: cat,
              size: value,
            },
          });
        }
      }
    }

    // Budgets — replace BudgetByCategory rows
    for (const cat of BUDGET_CATEGORIES) {
      const fieldKey = budgetFormFieldKey(cat);
      if (!formData.has(fieldKey)) continue;
      const parsed = parseBudget(formData.get(fieldKey));
      await tx.budgetByCategory.deleteMany({
        where: { userId: user.id, category: cat },
      });
      if (parsed) {
        await tx.budgetByCategory.create({
          data: {
            userId: user.id,
            category: cat,
            minInCents: parsed.minInCents,
            maxInCents: parsed.maxInCents,
          },
        });
      }
    }

    // Color preferences — replace
    if (formData.has("favoriteColors") || formData.has("avoidColors")) {
      await tx.colorPreference.deleteMany({ where: { userId: user.id } });
      const allColors = [
        ...favoriteColors.map((c) => ({ color: c, isLiked: true })),
        ...avoidColors.map((c) => ({ color: c, isLiked: false })),
      ];
      if (allColors.length > 0) {
        await tx.colorPreference.createMany({
          data: allColors.map((c) => ({ userId: user.id, ...c })),
        });
      }
    }

    // Pattern preferences — replace
    if (formData.has("favoritePatterns")) {
      await tx.patternPreference.deleteMany({
        where: { userId: user.id, isDisliked: false },
      });
      if (favoritePatterns.length > 0) {
        await tx.patternPreference.createMany({
          data: favoritePatterns.map((p) => ({
            userId: user.id,
            pattern: p,
            isDisliked: false,
          })),
        });
      }
    }

    // Fabric preferences — replace disliked-list (Loveable's "Materials to avoid")
    if (formData.has("materialsAvoid")) {
      await tx.fabricPreference.deleteMany({
        where: { userId: user.id, isDisliked: true },
      });
      if (materialsAvoid.length > 0) {
        await tx.fabricPreference.createMany({
          data: materialsAvoid.map((f) => ({
            userId: user.id,
            fabric: f,
            isDisliked: true,
          })),
        });
      }
    }

    // Location (primary) — same upsert pattern as updateProfile
    if (formData.has("location")) {
      const existing = await tx.userLocation.findFirst({
        where: { userId: user.id, isPrimary: true },
        select: { id: true },
      });
      if (location) {
        if (existing) {
          await tx.userLocation.update({
            where: { id: existing.id },
            data: { city: location.city, state: location.state },
          });
        } else {
          await tx.userLocation.create({
            data: {
              userId: user.id,
              city: location.city,
              state: location.state,
              isPrimary: true,
            },
          });
        }
      } else if (existing) {
        await tx.userLocation.delete({ where: { id: existing.id } });
      }
    }

    // Social links (instagram, pinterest)
    for (const platform of ["instagram", "pinterest"] as const) {
      if (!formData.has(platform)) continue;
      const value = platform === "instagram" ? instagram : pinterest;
      const existing = await tx.userSocialLink.findFirst({
        where: { userId: user.id, platform },
        select: { id: true },
      });
      if (value) {
        if (existing) {
          await tx.userSocialLink.update({
            where: { id: existing.id },
            data: { url: value },
          });
        } else {
          await tx.userSocialLink.create({
            data: { userId: user.id, platform, url: value },
          });
        }
      } else if (existing) {
        await tx.userSocialLink.delete({ where: { id: existing.id } });
      }
    }
  });

  revalidatePath("/settings");
}

function sizeFormFieldKey(cat: SizeCategory): string {
  switch (cat) {
    case "TOPS":
      return "topSize";
    case "BOTTOMS":
      return "bottomSize";
    case "JEANS":
      return "jeansSize";
    case "DRESSES":
      return "dressSize";
    case "OUTERWEAR":
      return "outerwearSize";
    case "SHOES":
      return "shoeSize";
  }
}

function budgetFormFieldKey(cat: BudgetCategory): string {
  switch (cat) {
    case "TOPS":
      return "budgetTops";
    case "BOTTOMS":
      return "budgetBottoms";
    case "SHOES":
      return "budgetShoes";
    case "JEWELRY":
      return "budgetJewelry";
    case "ACCESSORIES":
      return "budgetAccessories";
  }
}
