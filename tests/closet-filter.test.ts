import assert from "node:assert/strict";
import test from "node:test";
import {
  computeClosetFacets,
  filterClosetItems,
} from "@/lib/closet/filter";
import type { ClosetItem } from "@/generated/prisma/client";

// Minimal ClosetItem factory — only the fields the filter helpers read
// matter; everything else is filler so the type checks.
function item(overrides: Partial<ClosetItem>): ClosetItem {
  return {
    id: overrides.id ?? "x",
    userId: "u",
    s3Key: "k",
    url: "https://example.com/img.jpg",
    name: null,
    designer: null,
    season: null,
    category: null,
    colors: [],
    size: null,
    material: null,
    sourceOrderItemId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

test("computeClosetFacets dedupes + sorts each facet", () => {
  const items = [
    item({ id: "1", designer: "Loewe", season: "FALL_WINTER", category: "Bags", colors: ["tan", "black"] }),
    item({ id: "2", designer: "APC", season: "SPRING_SUMMER", category: "Tops", colors: ["white"] }),
    item({ id: "3", designer: "Loewe", season: "YEAR_ROUND", category: "Bags", colors: ["black"] }),
  ];
  const f = computeClosetFacets(items);
  assert.deepEqual(f.designer, ["APC", "Loewe"]);
  assert.deepEqual(f.season, ["FALL_WINTER", "SPRING_SUMMER", "YEAR_ROUND"]);
  assert.deepEqual(f.category, ["Bags", "Tops"]);
  assert.deepEqual(f.color, ["black", "tan", "white"]);
});

test("computeClosetFacets returns empty arrays for an empty closet", () => {
  const f = computeClosetFacets([]);
  assert.deepEqual(f.designer, []);
  assert.deepEqual(f.season, []);
  assert.deepEqual(f.color, []);
  assert.deepEqual(f.category, []);
});

test("computeClosetFacets skips empty strings + nulls", () => {
  const items = [
    item({ id: "1", designer: "", season: null, category: "Tops" }),
    item({ id: "2", designer: "APC", category: null }),
  ];
  const f = computeClosetFacets(items);
  assert.deepEqual(f.designer, ["APC"]);
  assert.deepEqual(f.category, ["Tops"]);
  assert.deepEqual(f.season, []);
});

test("filterClosetItems with no filters returns the input list", () => {
  const items = [item({ id: "1" }), item({ id: "2" })];
  assert.equal(filterClosetItems(items, {}).length, 2);
});

test("filterClosetItems narrows by designer", () => {
  const items = [
    item({ id: "1", designer: "Loewe" }),
    item({ id: "2", designer: "APC" }),
    item({ id: "3", designer: "Loewe" }),
  ];
  const out = filterClosetItems(items, { designer: ["Loewe"] });
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((i) => i.id), ["1", "3"]);
});

test("filterClosetItems OR-combines values within a dimension", () => {
  const items = [
    item({ id: "1", designer: "Loewe" }),
    item({ id: "2", designer: "APC" }),
    item({ id: "3", designer: "The Row" }),
  ];
  const out = filterClosetItems(items, { designer: ["Loewe", "APC"] });
  assert.deepEqual(out.map((i) => i.id), ["1", "2"]);
});

test("filterClosetItems narrows by season", () => {
  const items = [
    item({ id: "1", season: "FALL_WINTER" }),
    item({ id: "2", season: "SPRING_SUMMER" }),
  ];
  const out = filterClosetItems(items, { season: ["FALL_WINTER"] });
  assert.deepEqual(out.map((i) => i.id), ["1"]);
});

test("filterClosetItems color filter uses array membership, not equality", () => {
  const items = [
    item({ id: "1", colors: ["black", "tan"] }),
    item({ id: "2", colors: ["white"] }),
    item({ id: "3", colors: ["tan"] }),
  ];
  const out = filterClosetItems(items, { color: ["tan"] });
  assert.deepEqual(out.map((i) => i.id), ["1", "3"]);
});

test("filterClosetItems combines filters with AND across dimensions", () => {
  const items = [
    item({ id: "1", designer: "Loewe", category: "Bags" }),
    item({ id: "2", designer: "Loewe", category: "Tops" }),
    item({ id: "3", designer: "APC", category: "Bags" }),
  ];
  const out = filterClosetItems(items, {
    designer: ["Loewe"],
    category: ["Bags"],
  });
  assert.deepEqual(out.map((i) => i.id), ["1"]);
});

test("filterClosetItems empty arrays are treated as 'no filter'", () => {
  const items = [item({ id: "1", designer: "Loewe" })];
  assert.equal(filterClosetItems(items, { designer: [] }).length, 1);
  assert.equal(filterClosetItems(items, { designer: [""] }).length, 1);
});
