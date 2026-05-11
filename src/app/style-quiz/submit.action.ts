"use server";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { hasCompletedStyleQuiz } from "@/lib/quiz/style-quiz-status";
import {
  type LoveableQuizAnswers,
  aggregateBudgetBrackets,
  BUDGET_CATEGORY_KEYS,
  expandLikedColors,
  formatPhone,
  mapComfortZone,
  mapFit,
  mapHearAbout,
  mapHeight,
  mapShoppingReason,
  mapTendToWear,
  mapWorkEnvironment,
  mergeStyleIcons,
} from "@/lib/quiz/loveable-style-quiz";

export type SubmitContext =
  | { kind: "standalone"; returnPath?: string }
  | { kind: "session"; sessionId: string };

type SubmitResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: "unauthenticated" | "session_not_found" | "internal" };

/**
 * Single write path for Loveable's `/style-quiz`. Replaces the old
 * fieldKey-routed `persistStyleQuizAnswers` path now that the quiz is a
 * verbatim port of Loveable's bespoke 26-step flow.
 *
 * All writes happen in one Prisma transaction so a mid-submit failure
 * doesn't leave a partial profile. Idempotent — a second call once
 * `StyleProfile.quizCompletedAt` is set returns the redirect target
 * without rewriting.
 */
export async function submitStyleQuiz(
  answers: LoveableQuizAnswers,
  ctx: SubmitContext,
): Promise<SubmitResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  if (ctx.kind === "session") {
    const session = await prisma.session.findUnique({
      where: { id: ctx.sessionId },
      select: { clientId: true },
    });
    if (!session || session.clientId !== user.id) {
      return { ok: false, error: "session_not_found" };
    }
  }

  if (await hasCompletedStyleQuiz(user.id)) {
    return { ok: true, redirectTo: resolveRedirect(ctx) };
  }

  try {
    await persist(user.id, answers);
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "style_quiz_submit_failed",
        userId: user.id,
        ctxKind: ctx.kind,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
    return { ok: false, error: "internal" };
  }

  return { ok: true, redirectTo: resolveRedirect(ctx) };
}

function resolveRedirect(ctx: SubmitContext): string {
  if (ctx.kind === "session") return `/sessions/${ctx.sessionId}/chat`;
  return safeReturn(ctx.returnPath);
}

// Restrict to known internal paths so `?return=` can't be turned into an
// open-redirect. Mirrors the previous standalone action.
function safeReturn(returnPath: string | undefined): string {
  if (!returnPath) return "/stylists";
  if (!returnPath.startsWith("/")) return "/stylists";
  if (returnPath.startsWith("//")) return "/stylists";
  return returnPath;
}

async function persist(userId: string, answers: LoveableQuizAnswers): Promise<void> {
  const styleProfileData = {
    shoppingReason: mapShoppingReason(answers.shoppingFor),
    workEnvironment: answers.workEnvironment ? mapWorkEnvironment(answers.workEnvironment) : null,
    workEnvironmentOther:
      answers.workEnvironment === "Other"
        ? (answers.workEnvironmentOther ?? null)?.trim() || null
        : null,
    piecesNeeded: answers.pieces,
    wearLocation: answers.location?.trim() || null,
    tendToWear: answers.tendToWear ? mapTendToWear(answers.tendToWear) : null,
    comfortZone: answers.comfortZone ? mapComfortZone(answers.comfortZone) : null,
    occupation: answers.occupation?.trim() || null,
    styleIcons: mergeStyleIcons(answers.styleIcons, answers.styleIconsOther),
    shoppingValues: answers.values,
    notes: answers.extraNotes?.trim() || null,
    hearAboutSource: answers.hearAboutUs ? mapHearAbout(answers.hearAboutUs) : null,
    hearAboutSourceOther:
      answers.hearAboutUs === "Other"
        ? (answers.hearAboutUsOther ?? null)?.trim() || null
        : null,
    quizAnswers: answers as unknown as Prisma.InputJsonValue,
    quizCompletedAt: new Date(),
  };

  const bodyProfileData = {
    heightCategory: answers.heightPreference ? mapHeight(answers.heightPreference) : null,
    bodyPhotoUrl: answers.bodyPhotoUrl ?? null,
    highlightAreas: answers.accentuate,
    necklinesAvoid: answers.necklinesAvoid,
    bodyAreasMindful: answers.bodyAreas,
    bodyAreasNotes: answers.bodyAreasNotes?.trim() || null,
    topFit: answers.fitPreference ? mapFit(answers.fitPreference) : null,
    bottomFit: answers.fitBottomPreference ? mapFit(answers.fitBottomPreference) : null,
  };

  const likedColors = expandLikedColors(answers.selectedColors);
  const dislikedPatterns = answers.selectedPatterns;
  const dislikedMaterials = answers.materialsAvoid;
  const phone = formatPhone(answers.phoneCountryCode, answers.phoneNumber);
  const birthday = parseBirthday(answers.birthday);

  await prisma.$transaction(async (tx) => {
    await tx.styleProfile.upsert({
      where: { userId },
      create: { userId, ...styleProfileData },
      update: styleProfileData,
    });

    const bodyProfile = await tx.bodyProfile.upsert({
      where: { userId },
      create: { userId, ...bodyProfileData },
      update: bodyProfileData,
      select: { id: true },
    });

    // Body sizes — replace semantics: per-category multi-select means we
    // wipe the prior rows for each touched category and re-create. We only
    // touch categories the user actually answered, so an existing row in
    // an untouched category survives.
    const sizeWrites: { category: string; sizes: string[] }[] = [
      { category: "tops", sizes: answers.sizeTops },
      { category: "bottoms", sizes: answers.sizeBottoms },
      { category: "shoes", sizes: answers.sizeShoes },
      { category: "jeans", sizes: answers.sizeJeans },
      { category: "dresses", sizes: answers.sizeDresses },
      { category: "outerwear", sizes: answers.sizeOuterwear },
    ];
    for (const { category, sizes } of sizeWrites) {
      if (sizes.length === 0) continue;
      await tx.bodySize.deleteMany({ where: { bodyProfileId: bodyProfile.id, category } });
      await tx.bodySize.createMany({
        data: sizes.map((size) => ({ bodyProfileId: bodyProfile.id, category, size })),
        skipDuplicates: true,
      });
    }

    // Color preferences — Loveable only asks about liked colors in the quiz.
    // Don't touch dislikes here so a returning user's legacy dislike rows
    // survive. For likes: wipe + recreate.
    await tx.colorPreference.deleteMany({ where: { userId, isLiked: true } });
    if (likedColors.length > 0) {
      await tx.colorPreference.createMany({
        data: likedColors.map((color) => ({ userId, color, isLiked: true })),
        skipDuplicates: true,
      });
    }

    // Pattern preferences (Loveable asks about disliked-only).
    await tx.patternPreference.deleteMany({ where: { userId, isDisliked: true } });
    if (dislikedPatterns.length > 0) {
      await tx.patternPreference.createMany({
        data: dislikedPatterns.map((pattern) => ({ userId, pattern, isDisliked: true })),
        skipDuplicates: true,
      });
    }

    // Fabric preferences (Loveable asks about disliked-only).
    await tx.fabricPreference.deleteMany({ where: { userId, isDisliked: true } });
    if (dislikedMaterials.length > 0) {
      await tx.fabricPreference.createMany({
        data: dislikedMaterials.map((fabric) => ({ userId, fabric, isDisliked: true })),
        skipDuplicates: true,
      });
    }

    // Budgets — only upsert touched categories.
    const budgetWrites: { key: keyof typeof BUDGET_CATEGORY_KEYS; picks: typeof answers.budgetTops }[] = [
      { key: "Tops", picks: answers.budgetTops },
      { key: "Bottoms", picks: answers.budgetBottoms },
      { key: "Shoes", picks: answers.budgetShoes },
      { key: "Jewelry", picks: answers.budgetJewelry },
      { key: "Accessories", picks: answers.budgetAccessories },
    ];
    for (const { key, picks } of budgetWrites) {
      const range = aggregateBudgetBrackets(picks);
      if (!range) continue;
      await tx.budgetByCategory.upsert({
        where: { userId_category: { userId, category: BUDGET_CATEGORY_KEYS[key] } },
        create: { userId, category: BUDGET_CATEGORY_KEYS[key], ...range },
        update: range,
      });
    }

    // Social links — only touched when the user provided a non-empty value.
    if (answers.instagram?.trim()) {
      await tx.userSocialLink.upsert({
        where: { userId_platform: { userId, platform: "instagram" } },
        create: { userId, platform: "instagram", url: answers.instagram.trim() },
        update: { url: answers.instagram.trim() },
      });
    }
    if (answers.pinterest?.trim()) {
      await tx.userSocialLink.upsert({
        where: { userId_platform: { userId, platform: "pinterest" } },
        create: { userId, platform: "pinterest", url: answers.pinterest.trim() },
        update: { url: answers.pinterest.trim() },
      });
    }

    // User: birthday + phone. Email change is intentionally NOT written here
    // (Clerk owns identity; updating User.email out-of-band would break the
    // partial-unique constraint and the resignup flow).
    const userUpdate: Prisma.UserUpdateInput = {};
    if (birthday) userUpdate.birthday = birthday;
    if (phone) userUpdate.phone = phone;
    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: userId }, data: userUpdate });
    }
  });
}

function parseBirthday(raw: string | undefined): Date | null {
  if (!raw) return null;
  // Loveable's default seed is "1984-01-01"; only persist if the user
  // changed it. We can't distinguish "user left default" from "user
  // selected 1984-01-01", so accept the value either way — the field
  // is optional and overwriteable from /settings.
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
