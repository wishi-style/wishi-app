// Unit tests for the pure metadata helper in src/lib/stylists/invite.service.ts.
// The Clerk-API-touching wrappers (createStylistInvitation,
// listStylistInvitations, revokeStylistInvitation) are exercised by the e2e
// Playwright spec with the Clerk REST endpoint stubbed at the network layer.

import assert from "node:assert/strict";
import test from "node:test";
import { readStylistInvitationFromMetadata } from "@/lib/stylists/invite.service";

test("metadata without the stylistInvitation flag is rejected", () => {
  assert.equal(readStylistInvitationFromMetadata(null), null);
  assert.equal(readStylistInvitationFromMetadata(undefined), null);
  assert.equal(readStylistInvitationFromMetadata({}), null);
  assert.equal(
    readStylistInvitationFromMetadata({ stylistType: "PLATFORM" }),
    null,
  );
});

test("metadata with stylistInvitation=false is rejected", () => {
  assert.equal(
    readStylistInvitationFromMetadata({
      stylistInvitation: false,
      stylistType: "PLATFORM",
    }),
    null,
  );
});

test("PLATFORM invitation is read correctly", () => {
  assert.deepEqual(
    readStylistInvitationFromMetadata({
      stylistInvitation: true,
      stylistType: "PLATFORM",
    }),
    { stylistType: "PLATFORM" },
  );
});

test("IN_HOUSE invitation is read correctly", () => {
  assert.deepEqual(
    readStylistInvitationFromMetadata({
      stylistInvitation: true,
      stylistType: "IN_HOUSE",
    }),
    { stylistType: "IN_HOUSE" },
  );
});

test("invitation with unknown stylistType falls back to PLATFORM", () => {
  // Defensive: if Clerk hands back a metadata payload from an older
  // invitation that predates this field, we must not throw — auto-promotion
  // should still happen, defaulting to PLATFORM (the more conservative path,
  // since it requires Stripe Connect).
  assert.deepEqual(
    readStylistInvitationFromMetadata({
      stylistInvitation: true,
      stylistType: "GREMLIN",
    }),
    { stylistType: "PLATFORM" },
  );
  assert.deepEqual(
    readStylistInvitationFromMetadata({ stylistInvitation: true }),
    { stylistType: "PLATFORM" },
  );
});
