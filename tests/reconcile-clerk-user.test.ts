import assert from "node:assert/strict";
import test from "node:test";
import {
  determineAuthProvider,
  reconcileClerkUser,
  type ReconcileClerkUserDeps,
} from "@/lib/auth/reconcile-clerk-user";
import type { UserRole } from "@/generated/prisma/client";

// ─── determineAuthProvider ────────────────────────────────────────────

test("determineAuthProvider: no external accounts → EMAIL", () => {
  assert.equal(determineAuthProvider([]), "EMAIL");
});

test("determineAuthProvider: google variants → GOOGLE", () => {
  assert.equal(determineAuthProvider([{ provider: "google" }]), "GOOGLE");
  assert.equal(
    determineAuthProvider([{ provider: "oauth_google" }]),
    "GOOGLE",
  );
});

test("determineAuthProvider: apple variants → APPLE", () => {
  assert.equal(determineAuthProvider([{ provider: "apple" }]), "APPLE");
  assert.equal(
    determineAuthProvider([{ provider: "oauth_apple" }]),
    "APPLE",
  );
});

test("determineAuthProvider: unknown provider → EMAIL", () => {
  assert.equal(
    determineAuthProvider([{ provider: "oauth_microsoft" }]),
    "EMAIL",
  );
});

// ─── reconcileClerkUser ───────────────────────────────────────────────

interface Spy {
  findUserByClerkIdCalls: string[];
  fetchClerkUserCalls: string[];
  generateUniqueReferralCodeCalls: number;
  createUserCalls: Array<Parameters<ReconcileClerkUserDeps["createUser"]>[0]>;
  seedNotificationPreferencesCalls: string[];
  setClerkRoleCalls: Array<{ clerkId: string; role: UserRole }>;
}

function buildDeps(
  overrides: Partial<ReconcileClerkUserDeps> = {},
): { deps: ReconcileClerkUserDeps; spy: Spy } {
  const spy: Spy = {
    findUserByClerkIdCalls: [],
    fetchClerkUserCalls: [],
    generateUniqueReferralCodeCalls: 0,
    createUserCalls: [],
    seedNotificationPreferencesCalls: [],
    setClerkRoleCalls: [],
  };

  const deps: ReconcileClerkUserDeps = {
    findUserByClerkId: async (clerkId) => {
      spy.findUserByClerkIdCalls.push(clerkId);
      return null;
    },
    fetchClerkUser: async (clerkId) => {
      spy.fetchClerkUserCalls.push(clerkId);
      return {
        emailAddress: "new@example.com",
        firstName: "New",
        lastName: "User",
        imageUrl: null,
        externalAccounts: [],
      };
    },
    generateUniqueReferralCode: async () => {
      spy.generateUniqueReferralCodeCalls += 1;
      return "REF12345";
    },
    createUser: async (data) => {
      spy.createUserCalls.push(data);
      return { id: "user_db_new", role: "CLIENT" };
    },
    seedNotificationPreferences: async (userId) => {
      spy.seedNotificationPreferencesCalls.push(userId);
    },
    setClerkRole: async (clerkId, role) => {
      spy.setClerkRoleCalls.push({ clerkId, role });
    },
    ...overrides,
  };

  return { deps, spy };
}

test("existing row → metadata-only path: no fetch, no create, only setClerkRole", async () => {
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => ({ id: "user_db_1", role: "CLIENT" }),
  });

  const result = await reconcileClerkUser("user_clerk_1", deps);

  assert.deepEqual(result, {
    userId: "user_db_1",
    role: "CLIENT",
    created: false,
  });
  assert.equal(spy.fetchClerkUserCalls.length, 0);
  assert.equal(spy.createUserCalls.length, 0);
  assert.equal(spy.seedNotificationPreferencesCalls.length, 0);
  assert.deepEqual(spy.setClerkRoleCalls, [
    { clerkId: "user_clerk_1", role: "CLIENT" },
  ]);
});

test("existing row preserves DB role over default — STYLIST stays STYLIST", async () => {
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => ({ id: "user_db_1", role: "STYLIST" }),
  });

  const result = await reconcileClerkUser("user_clerk_1", deps);

  assert.equal(result.role, "STYLIST");
  // Critically: we write the existing role back to Clerk, not "CLIENT" default.
  // This is what makes a webhook-retry safe for already-promoted users.
  assert.deepEqual(spy.setClerkRoleCalls, [
    { clerkId: "user_clerk_1", role: "STYLIST" },
  ]);
});

test("missing row → full path: fetch + create + seed + setClerkRole", async () => {
  const { deps, spy } = buildDeps();

  const result = await reconcileClerkUser("user_clerk_2", deps);

  assert.equal(result.userId, "user_db_new");
  assert.equal(result.role, "CLIENT");
  assert.equal(result.created, true);

  assert.deepEqual(spy.fetchClerkUserCalls, ["user_clerk_2"]);
  assert.equal(spy.generateUniqueReferralCodeCalls, 1);
  assert.equal(spy.createUserCalls.length, 1);
  assert.deepEqual(spy.createUserCalls[0], {
    clerkId: "user_clerk_2",
    email: "new@example.com",
    firstName: "New",
    lastName: "User",
    avatarUrl: null,
    authProvider: "EMAIL",
    referralCode: "REF12345",
  });
  assert.deepEqual(spy.seedNotificationPreferencesCalls, ["user_db_new"]);
  assert.deepEqual(spy.setClerkRoleCalls, [
    { clerkId: "user_clerk_2", role: "CLIENT" },
  ]);
});

test("missing row + Clerk user has Google external account → authProvider GOOGLE", async () => {
  const { deps, spy } = buildDeps({
    fetchClerkUser: async () => ({
      emailAddress: "g@example.com",
      firstName: null,
      lastName: null,
      imageUrl: "https://img.example/x.png",
      externalAccounts: [{ provider: "oauth_google" }],
    }),
  });

  await reconcileClerkUser("user_clerk_3", deps);

  assert.equal(spy.createUserCalls[0].authProvider, "GOOGLE");
  assert.equal(spy.createUserCalls[0].avatarUrl, "https://img.example/x.png");
  assert.equal(spy.createUserCalls[0].firstName, ""); // null → ""
});

test("missing row + Clerk has no email → throws (does not create row)", async () => {
  const { deps, spy } = buildDeps({
    fetchClerkUser: async () => ({
      emailAddress: "",
      firstName: null,
      lastName: null,
      imageUrl: null,
      externalAccounts: [],
    }),
  });

  await assert.rejects(
    () => reconcileClerkUser("user_clerk_4", deps),
    /no primary email address/,
  );
  assert.equal(spy.createUserCalls.length, 0);
  assert.equal(spy.setClerkRoleCalls.length, 0);
});

test("idempotency: two consecutive calls with the same existing row both setClerkRole", async () => {
  // Webhook retries arrive after Clerk's `clerkId @unique` constraint trips.
  // The retry must still write Clerk metadata so a partially-completed first
  // attempt (DB row created, metadata write failed) self-heals on retry.
  let lookupCalls = 0;
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => {
      lookupCalls += 1;
      return { id: "user_db_5", role: "CLIENT" };
    },
  });

  await reconcileClerkUser("user_clerk_5", deps);
  await reconcileClerkUser("user_clerk_5", deps);

  assert.equal(lookupCalls, 2);
  assert.equal(spy.setClerkRoleCalls.length, 2);
  assert.equal(spy.createUserCalls.length, 0);
});
