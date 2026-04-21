// Unit tests for the step validation logic in src/lib/stylists/onboarding.ts.
// The DB-writing saveStep/advance/resume functions are exercised by the E2E
// wizard spec in Phase 6b.

import assert from "node:assert/strict";
import test from "node:test";
import { stepSchemas, TOTAL_STEPS } from "@/lib/stylists/onboarding";

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
