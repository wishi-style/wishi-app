// Unit tests for the free-text parsers backing the stylist profile
// Server Action. The Server Action itself is exercised by the Playwright
// spec; here we just lock the splitName / splitLocation behaviours.

import assert from "node:assert/strict";
import test from "node:test";
import {
  splitName,
  splitLocation,
} from "@/app/(stylist)/stylist/profile/helpers";

test("splitName: single token → empty lastName", () => {
  assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
});

test("splitName: two tokens → first + rest", () => {
  assert.deepEqual(splitName("Anna Wintour"), {
    firstName: "Anna",
    lastName: "Wintour",
  });
});

test("splitName: three or more tokens → first + remainder joined", () => {
  assert.deepEqual(splitName("Karl Otto Lagerfeld"), {
    firstName: "Karl",
    lastName: "Otto Lagerfeld",
  });
});

test("splitName: collapses inner whitespace", () => {
  assert.deepEqual(splitName("  Karl   Lagerfeld  "), {
    firstName: "Karl",
    lastName: "Lagerfeld",
  });
});

test("splitLocation: comma → city + state", () => {
  assert.deepEqual(splitLocation("New York, NY"), {
    city: "New York",
    state: "NY",
  });
});

test("splitLocation: city + country", () => {
  assert.deepEqual(splitLocation("Paris, France"), {
    city: "Paris",
    state: "France",
  });
});

test("splitLocation: no comma → city only", () => {
  assert.deepEqual(splitLocation("London"), { city: "London", state: null });
});

test("splitLocation: trailing comma → state null", () => {
  assert.deepEqual(splitLocation("Tokyo,"), { city: "Tokyo", state: null });
});
