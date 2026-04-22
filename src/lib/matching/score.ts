import type { StylistProfile, MatchQuizResult, Gender } from "@/generated/prisma/client";

/**
 * Cosmetic match score displayed to clients on the stylist directory.
 *
 * This is a user-facing affordance only — it does NOT feed the auto-matcher.
 * The auto-matcher in `lib/services/match.service.ts` has its own independent
 * scoring that drives assignment.
 *
 * Output range: 82-99 (always). The floor of 82 prevents the UI from ever
 * rendering something demotivating like "43% Match" while a weighted raw
 * score in [0, 1] controls the variance on top.
 *
 * Weighting of the raw [0, 1] composite:
 *   - 0.55 style overlap
 *   - 0.20 gender match
 *   - 0.15 budget match
 *   - 0.10 experience (capped at 10 years)
 *
 * Then: score = round(82 + raw * 17)
 */

export interface CosmeticScoreInputs {
  styleOverlap: number; // 0..1
  genderMatch: number; // 0..1
  budgetOverlap: number; // 0..1
  experienceYears: number; // raw years, clamped inside
}

const W_STYLE = 0.55;
const W_GENDER = 0.2;
const W_BUDGET = 0.15;
const W_EXPERIENCE = 0.1;

const FLOOR = 82;
const RANGE = 17;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function cosmeticScore(inputs: CosmeticScoreInputs): number {
  const style = clamp01(inputs.styleOverlap);
  const gender = clamp01(inputs.genderMatch);
  const budget = clamp01(inputs.budgetOverlap);
  const experience = clamp01((inputs.experienceYears ?? 0) / 10);

  const raw =
    style * W_STYLE +
    gender * W_GENDER +
    budget * W_BUDGET +
    experience * W_EXPERIENCE;

  return Math.round(FLOOR + clamp01(raw) * RANGE);
}

/**
 * Convenience wrapper that derives the four inputs from a StylistProfile +
 * MatchQuizResult pair and delegates to `cosmeticScore`.
 */
export function cosmeticMatchScore(
  stylist: Pick<
    StylistProfile,
    "styleSpecialties" | "genderPreference" | "budgetBrackets" | "yearsExperience"
  >,
  quizResult: Pick<
    MatchQuizResult,
    "styleDirection" | "genderToStyle" | "budgetBracket"
  > | null
): number {
  if (!quizResult) {
    // No quiz — derive what we can from the stylist alone so directory pages
    // still render something. Experience is the only axis that doesn't need
    // quiz data; style/budget/gender default to neutral 0.5.
    return cosmeticScore({
      styleOverlap: 0.5,
      genderMatch: 0.5,
      budgetOverlap: 0.5,
      experienceYears: stylist.yearsExperience ?? 0,
    });
  }

  return cosmeticScore({
    styleOverlap: computeStyleOverlap(quizResult.styleDirection, stylist.styleSpecialties),
    genderMatch: computeGenderMatch(
      quizResult.genderToStyle as Gender | null,
      stylist.genderPreference
    ),
    budgetOverlap: computeBudgetOverlap(
      quizResult.budgetBracket,
      stylist.budgetBrackets
    ),
    experienceYears: stylist.yearsExperience ?? 0,
  });
}

function computeStyleOverlap(clientStyles: string[], stylistStyles: string[]): number {
  if (clientStyles.length === 0 || stylistStyles.length === 0) return 0.5;
  const overlap = clientStyles.filter((s) => stylistStyles.includes(s)).length;
  return overlap / clientStyles.length;
}

function computeGenderMatch(
  clientGender: Gender | null,
  stylistGenders: Gender[]
): number {
  if (!clientGender || stylistGenders.length === 0) return 0.5;
  return stylistGenders.includes(clientGender) ? 1 : 0.2;
}

function computeBudgetOverlap<T>(
  clientBudget: T | null,
  stylistBudgets: T[]
): number {
  if (!clientBudget || stylistBudgets.length === 0) return 0.5;
  return stylistBudgets.includes(clientBudget) ? 1 : 0.25;
}
