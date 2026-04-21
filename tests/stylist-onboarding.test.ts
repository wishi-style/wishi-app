// Unit tests for the step validation logic in src/lib/stylists/onboarding.ts.
// The DB-writing saveStep/advance/resume functions are exercised by the E2E
// wizard spec in Phase 6b.

import assert from "node:assert/strict";
import test from "node:test";
import { computeNextState, stepSchemas, TOTAL_STEPS } from "@/lib/stylists/onboarding";

test("step 1 requires at least one gender", () => {
  assert.equal(stepSchemas[1].safeParse({ genderPreference: [] }).success, false);
  assert.equal(stepSchemas[1].safeParse({ genderPreference: ["FEMALE"] }).success, true);
});

test("step 1 rejects unknown gender values", () => {
  assert.equal(
    stepSchemas[1].safeParse({ genderPreference: ["HELICOPTER"] }).success,
    false
  );
});

test("step 3 requires both styleSpecialties and styleExpertiseLevels", () => {
  assert.equal(
    stepSchemas[3].safeParse({ styleSpecialties: ["minimal"], styleExpertiseLevels: {} }).success,
    false
  );
  assert.equal(
    stepSchemas[3].safeParse({
      styleSpecialties: ["minimal"],
      styleExpertiseLevels: { minimal: 2 },
    }).success,
    true
  );
});

test("step 3 level must be 1–3", () => {
  assert.equal(
    stepSchemas[3].safeParse({
      styleSpecialties: ["minimal"],
      styleExpertiseLevels: { minimal: 0 },
    }).success,
    false
  );
  assert.equal(
    stepSchemas[3].safeParse({
      styleSpecialties: ["minimal"],
      styleExpertiseLevels: { minimal: 4 },
    }).success,
    false
  );
});

test("step 5 requires explicit confirmation flag", () => {
  assert.equal(stepSchemas[5].safeParse({ confirmed: false }).success, false);
  assert.equal(stepSchemas[5].safeParse({ confirmed: true }).success, true);
});

test("step 6 requires phone + city + country", () => {
  assert.equal(
    stepSchemas[6].safeParse({ phone: "555", city: "SF", country: "US" }).success,
    false // phone too short
  );
  assert.equal(
    stepSchemas[6].safeParse({ phone: "+1 415 555 1234", city: "SF", country: "US" }).success,
    true
  );
});

test("step 7 requires ≥50-char philosophy", () => {
  assert.equal(stepSchemas[7].safeParse({ philosophy: "short" }).success, false);
  assert.equal(
    stepSchemas[7].safeParse({ philosophy: "a".repeat(50) }).success,
    true
  );
});

test("step 8 requires bio + yearsExperience", () => {
  assert.equal(
    stepSchemas[8].safeParse({ bio: "a".repeat(50), yearsExperience: -1 }).success,
    false
  );
  assert.equal(
    stepSchemas[8].safeParse({ bio: "a".repeat(50), yearsExperience: 10 }).success,
    true
  );
});

test("step 11 accepts common Instagram handle formats + rejects noise", () => {
  assert.equal(stepSchemas[11].safeParse({ instagramHandle: "@wishi.style" }).success, true);
  assert.equal(stepSchemas[11].safeParse({ instagramHandle: "wishi_style" }).success, true);
  assert.equal(stepSchemas[11].safeParse({ instagramHandle: null }).success, true);
  assert.equal(
    stepSchemas[11].safeParse({ instagramHandle: "has spaces" }).success,
    false
  );
});

test("TOTAL_STEPS is 12", () => {
  assert.equal(TOTAL_STEPS, 12);
});

test("stepSchemas covers all 12 steps", () => {
  for (let i = 1; i <= 12; i++) {
    assert.ok(stepSchemas[i as keyof typeof stepSchemas], `step ${i} schema missing`);
  }
});

// ── computeNextState: wizard state-machine ───────────────────────────────
// Locks in the PROFILE_CREATED / AWAITING_ELIGIBILITY transitions so a
// future "cleanup" can't reintroduce the step-lag bug Copilot flagged.

test("first advance (0 → 1) flips IN_PROGRESS", () => {
  assert.deepEqual(
    computeNextState({ onboardingStep: 0, onboardingStatus: "NOT_STARTED", isInHouse: false }),
    { step: 1, status: "IN_PROGRESS" }
  );
});

test("PLATFORM 9 → 10 flips PROFILE_CREATED the same call, not the next", () => {
  assert.deepEqual(
    computeNextState({ onboardingStep: 9, onboardingStatus: "IN_PROGRESS", isInHouse: false }),
    { step: 10, status: "PROFILE_CREATED" }
  );
});

test("PLATFORM 11 → 12 stays PROFILE_CREATED (Connect not done)", () => {
  assert.deepEqual(
    computeNextState({ onboardingStep: 11, onboardingStatus: "PROFILE_CREATED", isInHouse: false }),
    { step: 12, status: "PROFILE_CREATED" }
  );
});

test("PLATFORM 12 → 12 flips AWAITING_ELIGIBILITY (Connect return)", () => {
  assert.deepEqual(
    computeNextState({ onboardingStep: 12, onboardingStatus: "PROFILE_CREATED", isInHouse: false }),
    { step: 12, status: "AWAITING_ELIGIBILITY" }
  );
});

test("IN_HOUSE 10 → 11 flips PROFILE_CREATED, still needs one more advance", () => {
  assert.deepEqual(
    computeNextState({ onboardingStep: 10, onboardingStatus: "IN_PROGRESS", isInHouse: true }),
    { step: 11, status: "PROFILE_CREATED" }
  );
});

test("IN_HOUSE 11 → 11 flips AWAITING_ELIGIBILITY (skips Connect)", () => {
  assert.deepEqual(
    computeNextState({ onboardingStep: 11, onboardingStatus: "PROFILE_CREATED", isInHouse: true }),
    { step: 11, status: "AWAITING_ELIGIBILITY" }
  );
});

test("PLATFORM at intermediate steps does not flip status", () => {
  assert.deepEqual(
    computeNextState({ onboardingStep: 3, onboardingStatus: "IN_PROGRESS", isInHouse: false }),
    { step: 4, status: "IN_PROGRESS" }
  );
});
