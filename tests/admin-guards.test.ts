import assert from "node:assert/strict";
import test from "node:test";
import {
  canReassignSession,
  canFreezeSession,
  canUnfreezeSession,
  canCancelSession,
  canAdminPauseSubscription,
  canAdminCancelSubscription,
  canAdminReactivateSubscription,
  extractActor,
} from "@/lib/services/admin-guards";

// ─── Session guards ─────────────────────────────────────

test("reassign allowed for BOOKED, ACTIVE, PENDING_END, FROZEN", () => {
  assert.equal(canReassignSession("BOOKED"), true);
  assert.equal(canReassignSession("ACTIVE"), true);
  assert.equal(canReassignSession("PENDING_END"), true);
  assert.equal(canReassignSession("FROZEN"), true);
});

test("reassign blocked for terminal statuses", () => {
  assert.equal(canReassignSession("COMPLETED"), false);
  assert.equal(canReassignSession("CANCELLED"), false);
  assert.equal(canReassignSession("REASSIGNED"), false);
});

test("freeze allowed only for ACTIVE and PENDING_END", () => {
  assert.equal(canFreezeSession("ACTIVE"), true);
  assert.equal(canFreezeSession("PENDING_END"), true);
  assert.equal(canFreezeSession("BOOKED"), false);
  assert.equal(canFreezeSession("FROZEN"), false);
  assert.equal(canFreezeSession("COMPLETED"), false);
});

test("unfreeze allowed only for FROZEN", () => {
  assert.equal(canUnfreezeSession("FROZEN"), true);
  assert.equal(canUnfreezeSession("ACTIVE"), false);
  assert.equal(canUnfreezeSession("CANCELLED"), false);
});

test("cancel allowed everywhere except COMPLETED / CANCELLED", () => {
  assert.equal(canCancelSession("BOOKED"), true);
  assert.equal(canCancelSession("ACTIVE"), true);
  assert.equal(canCancelSession("FROZEN"), true);
  assert.equal(canCancelSession("PENDING_END_APPROVAL"), true);
  assert.equal(canCancelSession("COMPLETED"), false);
  assert.equal(canCancelSession("CANCELLED"), false);
});

// ─── Subscription guards ────────────────────────────────

test("admin pause only from ACTIVE", () => {
  assert.equal(canAdminPauseSubscription("ACTIVE"), true);
  assert.equal(canAdminPauseSubscription("TRIALING"), false);
  assert.equal(canAdminPauseSubscription("PAUSED"), false);
  assert.equal(canAdminPauseSubscription("CANCELLED"), false);
  assert.equal(canAdminPauseSubscription("PAST_DUE"), false);
});

test("admin cancel blocked only when already CANCELLED or EXPIRED", () => {
  assert.equal(canAdminCancelSubscription("ACTIVE"), true);
  assert.equal(canAdminCancelSubscription("TRIALING"), true);
  assert.equal(canAdminCancelSubscription("PAUSED"), true);
  assert.equal(canAdminCancelSubscription("PAST_DUE"), true);
  assert.equal(canAdminCancelSubscription("CANCELLED"), false);
  assert.equal(canAdminCancelSubscription("EXPIRED"), false);
});

test("admin reactivate requires PAUSED or a pending cancel request", () => {
  assert.equal(canAdminReactivateSubscription("PAUSED", false), true);
  assert.equal(canAdminReactivateSubscription("ACTIVE", true), true);
  assert.equal(canAdminReactivateSubscription("TRIALING", true), true);
  assert.equal(canAdminReactivateSubscription("ACTIVE", false), false);
  assert.equal(canAdminReactivateSubscription("CANCELLED", false), false);
});

// ─── Impersonation actor extraction ─────────────────────

test("extractActor returns null when no act claim", () => {
  assert.equal(extractActor(undefined), null);
  assert.equal(extractActor({}), null);
  assert.equal(extractActor({ metadata: { role: "ADMIN" } }), null);
  assert.equal(extractActor({ act: {} }), null);
});

test("extractActor returns admin clerkId when act.sub is set", () => {
  const result = extractActor({ act: { sub: "user_admin_123" } });
  assert.deepEqual(result, { adminClerkId: "user_admin_123" });
});

test("extractActor is lenient about extra sessionClaims shape", () => {
  const result = extractActor({
    metadata: { role: "CLIENT" },
    act: { sub: "user_admin_xyz" },
    exp: 9999999999,
  });
  assert.deepEqual(result, { adminClerkId: "user_admin_xyz" });
});
