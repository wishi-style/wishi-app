import { prisma } from "@/lib/prisma";
import type { FitPreference, HeelPreference, JewelryPreference } from "@/generated/prisma/client";

type FieldWriter = (userId: string, value: unknown) => Promise<void>;

const writers: Record<string, FieldWriter> = {
  // --- StyleProfile fields ---
  "style_profile.style_preferences": async (userId, value) => {
    await upsertStyleProfile(userId, { stylePreferences: value as string[] });
  },
  "style_profile.style_icons": async (userId, value) => {
    const icons = typeof value === "string" ? value.split(",").map((s) => s.trim()) : (value as string[]);
    await upsertStyleProfile(userId, { styleIcons: icons });
  },
  "style_profile.comfort_zone_level": async (userId, value) => {
    await upsertStyleProfile(userId, { comfortZoneLevel: Number(value) });
  },
  "style_profile.dress_code": async (userId, value) => {
    await upsertStyleProfile(userId, { dressCode: value as string });
  },
  "style_profile.occupation": async (userId, value) => {
    await upsertStyleProfile(userId, { occupation: value as string });
  },
  "style_profile.typically_wears": async (userId, value) => {
    await upsertStyleProfile(userId, { typicallyWears: value as string });
  },
  "style_profile.needs_description": async (userId, value) => {
    await upsertStyleProfile(userId, { needsDescription: value as string });
  },

  // --- BodyProfile fields ---
  "body_profile.body_type": async (userId, value) => {
    await upsertBodyProfile(userId, { bodyType: value as string });
  },
  "body_profile.body_issues": async (userId, value) => {
    await upsertBodyProfile(userId, { bodyIssues: value as string });
  },
  "body_profile.highlight_areas": async (userId, value) => {
    await upsertBodyProfile(userId, { highlightAreas: value as string[] });
  },
  "body_profile.height": async (userId, value) => {
    await upsertBodyProfile(userId, { height: value as string });
  },
  "body_profile.top_fit": async (userId, value) => {
    await upsertBodyProfile(userId, { topFit: value as FitPreference });
  },
  "body_profile.bottom_fit": async (userId, value) => {
    await upsertBodyProfile(userId, { bottomFit: value as FitPreference });
  },

  // --- ColorPreference fields ---
  "color_preference.liked": async (userId, value) => {
    const colors = value as string[];
    for (const color of colors) {
      await prisma.colorPreference.upsert({
        where: { userId_color: { userId, color } },
        update: { isLiked: true },
        create: { userId, color, isLiked: true },
      });
    }
  },
  "color_preference.disliked": async (userId, value) => {
    const colors = value as string[];
    for (const color of colors) {
      await prisma.colorPreference.upsert({
        where: { userId_color: { userId, color } },
        update: { isLiked: false },
        create: { userId, color, isLiked: false },
      });
    }
  },

  // --- FabricPreference ---
  "fabric_preference.disliked": async (userId, value) => {
    const fabrics = value as string[];
    for (const fabric of fabrics) {
      await prisma.fabricPreference.upsert({
        where: { userId_fabric: { userId, fabric } },
        update: { isDisliked: true },
        create: { userId, fabric, isDisliked: true },
      });
    }
  },

  // --- PatternPreference ---
  "pattern_preference.disliked": async (userId, value) => {
    const patterns = value as string[];
    for (const pattern of patterns) {
      await prisma.patternPreference.upsert({
        where: { userId_pattern: { userId, pattern } },
        update: { isDisliked: true },
        create: { userId, pattern, isDisliked: true },
      });
    }
  },

  // --- SpecificPreference fields ---
  "specific_preference.denim_fit": async (userId, value) => {
    await upsertSpecificPreference(userId, { denimFit: value as string });
  },
  "specific_preference.dress_styles": async (userId, value) => {
    await upsertSpecificPreference(userId, { dressStyles: value as string[] });
  },
  "specific_preference.heel_preference": async (userId, value) => {
    await upsertSpecificPreference(userId, { heelPreference: value as HeelPreference });
  },
  "specific_preference.jewelry_preference": async (userId, value) => {
    await upsertSpecificPreference(userId, { jewelryPreference: value as JewelryPreference });
  },

  // --- User fields ---
  "user.favorite_brands": async (userId, value) => {
    const brands = typeof value === "string" ? value.split(",").map((s) => s.trim()) : (value as string[]);
    await prisma.user.update({
      where: { id: userId },
      data: { favoriteBrands: brands },
    });
  },
};

async function upsertStyleProfile(userId: string, data: Record<string, unknown>) {
  await prisma.styleProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

async function upsertBodyProfile(userId: string, data: Record<string, unknown>) {
  await prisma.bodyProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

async function upsertSpecificPreference(userId: string, data: Record<string, unknown>) {
  await prisma.specificPreference.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

export async function routeFieldWrite(userId: string, fieldKey: string, value: unknown) {
  const writer = writers[fieldKey];
  if (!writer) {
    console.warn(`No field writer for key: ${fieldKey}`);
    return;
  }
  await writer(userId, value);
}
