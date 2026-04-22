import assert from "node:assert/strict";
import test from "node:test";
import { cosmeticScore, cosmeticMatchScore } from "@/lib/matching/score";

test("cosmeticScore floor is 82 for all-zero inputs", () => {
  assert.equal(
    cosmeticScore({
      styleOverlap: 0,
      genderMatch: 0,
      budgetOverlap: 0,
      experienceYears: 0,
    }),
    82,
  );
});

test("cosmeticScore ceiling is 99 for all-perfect inputs", () => {
  assert.equal(
    cosmeticScore({
      styleOverlap: 1,
      genderMatch: 1,
      budgetOverlap: 1,
      experienceYears: 10,
    }),
    99,
  );
});

test("cosmeticScore clamps inputs outside 0-1", () => {
  // Supplying >1 values should be clamped and still give 99
  assert.equal(
    cosmeticScore({
      styleOverlap: 5,
      genderMatch: 10,
      budgetOverlap: 3,
      experienceYears: 99,
    }),
    99,
  );
  // Negative values should be clamped to 0
  assert.equal(
    cosmeticScore({
      styleOverlap: -1,
      genderMatch: -2,
      budgetOverlap: -3,
      experienceYears: -10,
    }),
    82,
  );
});

test("cosmeticScore weights style overlap most heavily (0.55)", () => {
  const styleOnly = cosmeticScore({
    styleOverlap: 1,
    genderMatch: 0,
    budgetOverlap: 0,
    experienceYears: 0,
  });
  // 82 + 1 * 0.55 * 17 = 82 + 9.35 = 91.35 → round to 91
  assert.equal(styleOnly, 91);
});

test("cosmeticScore weights gender match at 0.20", () => {
  const genderOnly = cosmeticScore({
    styleOverlap: 0,
    genderMatch: 1,
    budgetOverlap: 0,
    experienceYears: 0,
  });
  // 82 + 1 * 0.20 * 17 = 82 + 3.4 = 85.4 → round to 85
  assert.equal(genderOnly, 85);
});

test("cosmeticScore weights budget overlap at 0.15", () => {
  const budgetOnly = cosmeticScore({
    styleOverlap: 0,
    genderMatch: 0,
    budgetOverlap: 1,
    experienceYears: 0,
  });
  // 82 + 1 * 0.15 * 17 = 82 + 2.55 = 84.55 → round to 85
  assert.equal(budgetOnly, 85);
});

test("cosmeticScore weights experience at 0.10, capped at 10 years", () => {
  const tenYears = cosmeticScore({
    styleOverlap: 0,
    genderMatch: 0,
    budgetOverlap: 0,
    experienceYears: 10,
  });
  const twentyYears = cosmeticScore({
    styleOverlap: 0,
    genderMatch: 0,
    budgetOverlap: 0,
    experienceYears: 20,
  });
  assert.equal(tenYears, twentyYears);
  // 82 + 1 * 0.10 * 17 = 82 + 1.7 = 83.7 → round to 84
  assert.equal(tenYears, 84);
});

test("cosmeticScore is always in [82, 99]", () => {
  const cases: Array<[number, number, number, number]> = [
    [0, 0, 0, 0],
    [0.5, 0.5, 0.5, 5],
    [0.1, 0.9, 0.3, 2],
    [1, 1, 1, 10],
    [0.25, 0.75, 0.5, 7],
  ];
  for (const [styleOverlap, genderMatch, budgetOverlap, experienceYears] of cases) {
    const score = cosmeticScore({
      styleOverlap,
      genderMatch,
      budgetOverlap,
      experienceYears,
    });
    assert.ok(score >= 82, `expected >=82, got ${score}`);
    assert.ok(score <= 99, `expected <=99, got ${score}`);
  }
});

test("cosmeticMatchScore with null quiz result returns neutral score", () => {
  const score = cosmeticMatchScore(
    {
      styleSpecialties: ["modern"],
      genderPreference: ["FEMALE"],
      budgetBrackets: ["MID"],
      yearsExperience: 5,
    },
    null,
  );
  // neutral-0.5 across style/gender/budget + 0.5 experience factor
  // = 0.5*(0.55+0.20+0.15) + 0.5*0.10 = 0.45 + 0.05 = 0.50
  // 82 + 0.50 * 17 = 82 + 8.5 = 90.5 → 91
  assert.equal(score, 91);
  assert.ok(score >= 82 && score <= 99);
});

test("cosmeticMatchScore with perfect overlap returns high score", () => {
  const score = cosmeticMatchScore(
    {
      styleSpecialties: ["modern", "classic"],
      genderPreference: ["FEMALE"],
      budgetBrackets: ["MID"],
      yearsExperience: 15,
    },
    {
      styleDirection: ["modern", "classic"],
      genderToStyle: "FEMALE",
      budgetBracket: "MID",
    },
  );
  // perfect across the board with 15y experience clamped to 10
  assert.equal(score, 99);
});

test("cosmeticMatchScore with no style match + no gender match still >=82", () => {
  const score = cosmeticMatchScore(
    {
      styleSpecialties: ["rocker"],
      genderPreference: ["MALE"],
      budgetBrackets: ["BUDGET"],
      yearsExperience: 0,
    },
    {
      styleDirection: ["preppy"],
      genderToStyle: "FEMALE",
      budgetBracket: "LUX",
    },
  );
  assert.ok(score >= 82);
  assert.ok(score <= 99);
});
