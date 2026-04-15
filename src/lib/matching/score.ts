import type { StylistProfile, MatchQuizResult, Gender } from "@/generated/prisma/client";

/**
 * Cosmetic match score displayed to clients on the stylist directory.
 * Returns a number in the 82-99 range.
 *
 * Weighting:
 * - 55% style overlap
 * - 20% gender match
 * - 15% budget match
 * - 10% experience
 */
export function cosmeticMatchScore(
  stylist: Pick<
    StylistProfile,
    "styleSpecialties" | "genderPreference" | "budgetBrackets" | "yearsExperience"
  >,
  quizResult: Pick<MatchQuizResult, "styleDirection" | "genderToStyle" | "budgetBracket"> | null
): number {
  if (!quizResult) {
    // No quiz result — return a neutral high score
    return 85 + Math.floor(Math.random() * 10);
  }

  let score = 0;

  // Style overlap (55%)
  const clientStyles = quizResult.styleDirection ?? [];
  const stylistStyles = stylist.styleSpecialties ?? [];
  if (clientStyles.length > 0 && stylistStyles.length > 0) {
    const overlap = clientStyles.filter((s) => stylistStyles.includes(s)).length;
    const ratio = overlap / Math.max(clientStyles.length, 1);
    score += ratio * 55;
  } else {
    score += 30; // neutral
  }

  // Gender match (20%)
  const clientGender = quizResult.genderToStyle;
  const stylistGenders = stylist.genderPreference ?? [];
  if (clientGender && stylistGenders.length > 0) {
    if (stylistGenders.includes(clientGender as Gender)) {
      score += 20;
    } else {
      score += 5;
    }
  } else {
    score += 12;
  }

  // Budget match (15%)
  const clientBudget = quizResult.budgetBracket;
  const stylistBudgets = stylist.budgetBrackets ?? [];
  if (clientBudget && stylistBudgets.length > 0) {
    if (stylistBudgets.includes(clientBudget)) {
      score += 15;
    } else {
      score += 5;
    }
  } else {
    score += 8;
  }

  // Experience (10%)
  const years = stylist.yearsExperience ?? 0;
  score += Math.min(years / 10, 1) * 10;

  // Clamp to 82-99
  return Math.max(82, Math.min(99, Math.round(score)));
}
