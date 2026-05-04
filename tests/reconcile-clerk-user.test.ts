import assert from "node:assert/strict";
import test from "node:test";
import {
  determineAuthProvider,
  parseRoleClaims,
  reconcileClerkUser,
  reconcileClerkUserResilient,
  type ReconcileClerkUserDeps,
  type RoleClaims,
} from "@/lib/auth/reconcile-clerk-user";

// ─── parseRoleClaims ──────────────────────────────────────────────────

test("parseRoleClaims: missing metadata → reconcile", () => {
  const r = parseRoleClaims(undefined);
  assert.equal(r.role, undefined);
  assert.equal(r.isAdmin, false);
  assert.equal(r.needsReconcile, true);
});

test("parseRoleClaims: empty object → reconcile", () => {
  const r = parseRoleClaims({});
  assert.equal(r.role, undefined);
  assert.equal(r.needsReconcile, true);
});

test("parseRoleClaims: valid CLIENT role + isAdmin false → no reconcile", () => {
  const r = parseRoleClaims({ role: "CLIENT", isAdmin: false });
  assert.equal(r.role, "CLIENT");
  assert.equal(r.isAdmin, false);
  assert.equal(r.needsReconcile, false);
});

test("parseRoleClaims: valid STYLIST role + isAdmin true → no reconcile", () => {
  const r = parseRoleClaims({ role: "STYLIST", isAdmin: true });
  assert.equal(r.role, "STYLIST");
  assert.equal(r.isAdmin, true);
  assert.equal(r.needsReconcile, false);
});

test("parseRoleClaims: legacy ADMIN role → role undefined + reconcile", () => {
  // Pre-migration JWTs can carry role:"ADMIN". The role is not one of the
  // current enum values, so we treat it as missing and trigger self-heal —
  // this prevents the transition-period 403 lockout for existing admins.
  const r = parseRoleClaims({ role: "ADMIN" });
  assert.equal(r.role, undefined);
  assert.equal(r.needsReconcile, true);
});

test("parseRoleClaims: valid role but isAdmin claim missing → reconcile", () => {
  // A JWT issued before the new shape carries role:"CLIENT" with no isAdmin
  // key. The DB row may have isAdmin=true (e.g. for a backfilled admin) so
  // we must reconcile to pick that up.
  const r = parseRoleClaims({ role: "CLIENT" });
  assert.equal(r.role, "CLIENT");
  assert.equal(r.isAdmin, false);
  assert.equal(r.needsReconcile, true);
});

test("parseRoleClaims: non-string role → reconcile", () => {
  // Defensive: anything weird in the role slot triggers reconcile.
  const r = parseRoleClaims({ role: 42, isAdmin: false });
  assert.equal(r.role, undefined);
  assert.equal(r.needsReconcile, true);
});

test("parseRoleClaims: non-boolean isAdmin → reconcile", () => {
  const r = parseRoleClaims({ role: "CLIENT", isAdmin: "true" });
  assert.equal(r.isAdmin, false);
  assert.equal(r.needsReconcile, true);
});

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
  setClerkClaimsCalls: Array<{ clerkId: string; claims: RoleClaims }>;
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
    setClerkClaimsCalls: [],
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
      return { id: "user_db_new", role: "CLIENT", isAdmin: false };
    },
    seedNotificationPreferences: async (userId) => {
      spy.seedNotificationPreferencesCalls.push(userId);
    },
    setClerkClaims: async (clerkId, claims) => {
      spy.setClerkClaimsCalls.push({ clerkId, claims });
    },
    ...overrides,
  };

  return { deps, spy };
}

test("existing row → metadata-only path: no fetch, no create, only setClerkClaims", async () => {
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => ({
      id: "user_db_1",
      role: "CLIENT",
      isAdmin: false,
    }),
  });

  const result = await reconcileClerkUser("user_clerk_1", deps);

  assert.deepEqual(result, {
    userId: "user_db_1",
    role: "CLIENT",
    isAdmin: false,
    created: false,
  });
  assert.equal(spy.fetchClerkUserCalls.length, 0);
  assert.equal(spy.createUserCalls.length, 0);
  assert.equal(spy.seedNotificationPreferencesCalls.length, 0);
  assert.deepEqual(spy.setClerkClaimsCalls, [
    { clerkId: "user_clerk_1", claims: { role: "CLIENT", isAdmin: false } },
  ]);
});

test("existing row preserves DB role over default — STYLIST stays STYLIST", async () => {
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => ({
      id: "user_db_1",
      role: "STYLIST",
      isAdmin: false,
    }),
  });

  const result = await reconcileClerkUser("user_clerk_1", deps);

  assert.equal(result.role, "STYLIST");
  // Critically: we write the existing role back to Clerk, not "CLIENT" default.
  // This is what makes a webhook-retry safe for already-promoted users.
  assert.deepEqual(spy.setClerkClaimsCalls, [
    { clerkId: "user_clerk_1", claims: { role: "STYLIST", isAdmin: false } },
  ]);
});

test("existing row preserves isAdmin=true over default — admin stays admin", async () => {
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => ({
      id: "user_db_1",
      role: "CLIENT",
      isAdmin: true,
    }),
  });

  const result = await reconcileClerkUser("user_clerk_1", deps);

  assert.equal(result.isAdmin, true);
  // A webhook retry on an existing admin user must not strip their flag.
  assert.deepEqual(spy.setClerkClaimsCalls, [
    { clerkId: "user_clerk_1", claims: { role: "CLIENT", isAdmin: true } },
  ]);
});

test("missing row → full path: fetch + create + seed + setClerkClaims", async () => {
  const { deps, spy } = buildDeps();

  const result = await reconcileClerkUser("user_clerk_2", deps);

  assert.equal(result.userId, "user_db_new");
  assert.equal(result.role, "CLIENT");
  assert.equal(result.isAdmin, false);
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
  assert.deepEqual(spy.setClerkClaimsCalls, [
    { clerkId: "user_clerk_2", claims: { role: "CLIENT", isAdmin: false } },
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
  assert.equal(spy.setClerkClaimsCalls.length, 0);
});

test("idempotency: two consecutive calls with the same existing row both setClerkClaims", async () => {
  // Webhook retries arrive after Clerk's `clerkId @unique` constraint trips.
  // The retry must still write Clerk metadata so a partially-completed first
  // attempt (DB row created, metadata write failed) self-heals on retry.
  let lookupCalls = 0;
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => {
      lookupCalls += 1;
      return { id: "user_db_5", role: "CLIENT", isAdmin: false };
    },
  });

  await reconcileClerkUser("user_clerk_5", deps);
  await reconcileClerkUser("user_clerk_5", deps);

  assert.equal(lookupCalls, 2);
  assert.equal(spy.setClerkClaimsCalls.length, 2);
  assert.equal(spy.createUserCalls.length, 0);
});

// ─── reconcileClerkUserResilient ──────────────────────────────────────

test("resilient: existing row + Clerk write succeeds → syncedClerk=true", async () => {
  const { deps, spy } = buildDeps({
    findUserByClerkId: async () => ({
      id: "user_db_r1",
      role: "CLIENT",
      isAdmin: false,
    }),
  });

  const result = await reconcileClerkUserResilient("user_clerk_r1", deps);

  assert.deepEqual(result, {
    userId: "user_db_r1",
    role: "CLIENT",
    isAdmin: false,
    created: false,
    syncedClerk: true,
  });
  assert.deepEqual(spy.setClerkClaimsCalls, [
    { clerkId: "user_clerk_r1", claims: { role: "CLIENT", isAdmin: false } },
  ]);
});

test("resilient: existing row + Clerk write throws → DB role still returned, syncedClerk=false", async () => {
  // The original failure mode this guards against: a transient Clerk API
  // error throws inside reconcile and `selfHeal` swallows the entire
  // result, leaving `requireRole` with `role=undefined` and 403'ing a user
  // we already correctly identified in the DB.
  const { deps } = buildDeps({
    findUserByClerkId: async () => ({
      id: "user_db_r2",
      role: "STYLIST",
      isAdmin: false,
    }),
    setClerkClaims: async () => {
      throw new Error("clerk 503");
    },
  });

  const result = await reconcileClerkUserResilient("user_clerk_r2", deps);

  // We still report the DB-resolved role. The caller (`requireRole`) can
  // make a routing decision; the Clerk JWT will catch up on a future
  // request.
  assert.equal(result.role, "STYLIST");
  assert.equal(result.isAdmin, false);
  assert.equal(result.syncedClerk, false);
  assert.equal(result.created, false);
});

test("resilient: missing row + Clerk write throws → still creates user + returns role", async () => {
  // First-contact failure: webhook never fired, the DB row gets created
  // here, and even if the metadata write fails the request can proceed.
  const { deps, spy } = buildDeps({
    setClerkClaims: async () => {
      throw new Error("clerk timeout");
    },
  });

  const result = await reconcileClerkUserResilient("user_clerk_r3", deps);

  assert.equal(result.created, true);
  assert.equal(result.role, "CLIENT");
  assert.equal(result.syncedClerk, false);
  assert.equal(spy.createUserCalls.length, 1);
  assert.equal(spy.seedNotificationPreferencesCalls.length, 1);
});

test("resilient: DB lookup throw still propagates (not swallowed)", async () => {
  // The Clerk metadata write is opportunistic — the DB read isn't. A DB
  // outage or schema error should still surface so the caller can 403 (or
  // decide its own fallback). Resilient ≠ silent.
  const { deps } = buildDeps({
    findUserByClerkId: async () => {
      throw new Error("connection refused");
    },
  });

  await assert.rejects(
    () => reconcileClerkUserResilient("user_clerk_r4", deps),
    /connection refused/,
  );
});

test("resilient: P2002 email collision still throws (not swallowed)", async () => {
  // Same logic — a real DB constraint failure must surface, even though
  // we're in the opportunistic branch.
  const { deps } = buildDeps({
    findUserByClerkId: async () => null,
    createUser: async () => {
      const e = Object.assign(new Error("collision"), {
        code: "P2002",
        meta: { target: ["email"] },
      });
      throw e;
    },
  });

  await assert.rejects(
    () => reconcileClerkUserResilient("user_clerk_r5", deps),
    /email_collision/,
  );
});
