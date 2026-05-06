// Display-name fallback rules for surfaces that show one user to another
// (stylist dashboard list, ClientDetailPanel header, board builder chrome).
//
// Pinned because Clerk OAuth signups + the guest-quiz claim path leave
// firstName/lastName empty, and the previous fallback collapsed every such
// row to the literal "Client" — which made the stylist's queue look like
// it had every booking from the same person.
import assert from "node:assert/strict";
import test from "node:test";

import { clientDisplayName, clientInitials } from "@/lib/users/display-name";

test("clientDisplayName uses the full name when both first + last are present", () => {
  assert.equal(clientDisplayName("Jane", "Doe", "jane@example.com"), "Jane Doe");
});

test("clientDisplayName falls back to first name alone when last is missing", () => {
  assert.equal(clientDisplayName("Jane", null, "jane@example.com"), "Jane");
  assert.equal(clientDisplayName("Jane", "", "jane@example.com"), "Jane");
});

test("clientDisplayName falls back to email handle when both names are empty", () => {
  // The handle is capitalised so "matthewcar@wishi.me" reads "Matthewcar"
  // rather than the lowercase form Clerk emits.
  assert.equal(
    clientDisplayName(null, null, "matthewcar@wishi.me"),
    "Matthewcar",
  );
  assert.equal(
    clientDisplayName("", "", "matthewcar@wishi.me"),
    "Matthewcar",
  );
});

test("clientDisplayName preserves dotted/numbered handles unchanged after the first letter", () => {
  assert.equal(
    clientDisplayName(null, null, "jane.doe-42@wishi.me"),
    "Jane.doe-42",
  );
});

test("clientDisplayName falls all the way through to 'Client' when nothing usable is available", () => {
  assert.equal(clientDisplayName(null, null, null), "Client");
  assert.equal(clientDisplayName("", "", ""), "Client");
  assert.equal(clientDisplayName(null, null, "@wishi.me"), "Client");
});

test("clientDisplayName trims whitespace-only name parts before falling back", () => {
  assert.equal(
    clientDisplayName("   ", "  ", "matt@wishi.me"),
    "Matt",
  );
});

test("clientInitials prefers the first-letter pair when names exist", () => {
  assert.equal(clientInitials("Jane", "Doe", "jane@example.com"), "JD");
  assert.equal(clientInitials("Jane", null, "jane@example.com"), "J");
});

test("clientInitials falls back to the first letter of the email handle", () => {
  assert.equal(clientInitials(null, null, "matthewcar@wishi.me"), "M");
});

test("clientInitials falls all the way through to '?' when nothing is available", () => {
  assert.equal(clientInitials(null, null, null), "?");
  assert.equal(clientInitials("", "", ""), "?");
});
