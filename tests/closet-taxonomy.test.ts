import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDesigner,
  deriveSeason,
  canonicalizeColors,
} from "@/lib/closet/taxonomy";

test("normalizeDesigner trims and title-cases multi-word brands", () => {
  assert.equal(normalizeDesigner("  saint laurent "), "Saint Laurent");
});

test("normalizeDesigner preserves short acronyms", () => {
  assert.equal(normalizeDesigner("APC"), "APC");
  assert.equal(normalizeDesigner("YSL paris"), "YSL Paris");
});

test("normalizeDesigner returns null for empty input", () => {
  assert.equal(normalizeDesigner(""), null);
  assert.equal(normalizeDesigner("   "), null);
  assert.equal(normalizeDesigner(null), null);
  assert.equal(normalizeDesigner(undefined), null);
});

test("deriveSeason picks FALL_WINTER for cold-month outerwear", () => {
  const nov = new Date("2026-11-15T12:00:00Z");
  assert.equal(deriveSeason("outerwear", nov), "FALL_WINTER");
  assert.equal(deriveSeason("jacket", nov), "FALL_WINTER");
});

test("deriveSeason picks SPRING_SUMMER for warm-month swim/shorts", () => {
  const jun = new Date("2026-06-15T12:00:00Z");
  assert.equal(deriveSeason("swim", jun), "SPRING_SUMMER");
  assert.equal(deriveSeason("shorts", jun), "SPRING_SUMMER");
});

test("deriveSeason falls back to YEAR_ROUND for generic categories", () => {
  assert.equal(
    deriveSeason("dress", new Date("2026-06-15T12:00:00Z")),
    "YEAR_ROUND",
  );
  assert.equal(deriveSeason(null, new Date()), "YEAR_ROUND");
  assert.equal(deriveSeason(undefined, new Date()), "YEAR_ROUND");
});

test("canonicalizeColors lowercases and dedupes", () => {
  const result = canonicalizeColors(["Black", "Red", "BLACK", "red"]);
  assert.deepEqual([...result].sort(), ["black", "red"]);
});

test("canonicalizeColors returns empty for nullish input", () => {
  assert.deepEqual(canonicalizeColors(null), []);
  assert.deepEqual(canonicalizeColors(undefined), []);
  assert.deepEqual(canonicalizeColors([]), []);
});
