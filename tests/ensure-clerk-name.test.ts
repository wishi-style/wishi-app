import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureUserNamesFromClerk,
  __resetEnsureClerkNameCacheForTests,
} from "../src/lib/users/ensure-clerk-name";

function makeRow(overrides: {
  id?: string;
  clerkId?: string | null;
  firstName?: string;
  lastName?: string;
}) {
  return {
    id: overrides.id ?? "u_1",
    clerkId: "clerkId" in overrides ? (overrides.clerkId as string | null) : "user_abc",
    firstName: overrides.firstName ?? "",
    lastName: overrides.lastName ?? "",
  };
}

function makeDeps(opts: {
  clerk?: Record<string, { firstName: string | null; lastName: string | null }>;
  fetchSpy?: { count: number };
  updateSpy?: { calls: Array<{ id: string; firstName: string; lastName: string }> };
} = {}) {
  const clerk = opts.clerk ?? {};
  const fetchSpy = opts.fetchSpy ?? { count: 0 };
  const updateSpy = opts.updateSpy ?? { calls: [] };
  return {
    fetchClerkUser: async (clerkId: string) => {
      fetchSpy.count++;
      const found = clerk[clerkId];
      if (!found) throw new Error(`unknown clerk user: ${clerkId}`);
      return found;
    },
    updateUserName: async (id: string, data: { firstName: string; lastName: string }) => {
      updateSpy.calls.push({ id, ...data });
    },
  };
}

test("populates empty row from Clerk", async () => {
  __resetEnsureClerkNameCacheForTests();
  const row = makeRow({ id: "u_1", clerkId: "user_a" });
  const updateSpy = { calls: [] as Array<{ id: string; firstName: string; lastName: string }> };
  await ensureUserNamesFromClerk(
    [row],
    makeDeps({ clerk: { user_a: { firstName: "Matt", lastName: "Cardozo" } }, updateSpy }),
  );
  assert.equal(row.firstName, "Matt");
  assert.equal(row.lastName, "Cardozo");
  assert.deepEqual(updateSpy.calls, [
    { id: "u_1", firstName: "Matt", lastName: "Cardozo" },
  ]);
});

test("skips rows that already have a name", async () => {
  __resetEnsureClerkNameCacheForTests();
  const fetchSpy = { count: 0 };
  const row = makeRow({ id: "u_1", clerkId: "user_a", firstName: "Already", lastName: "Set" });
  await ensureUserNamesFromClerk(
    [row],
    makeDeps({ clerk: { user_a: { firstName: "Other", lastName: "Name" } }, fetchSpy }),
  );
  assert.equal(fetchSpy.count, 0);
  assert.equal(row.firstName, "Already");
});

test("skips rows whose clerkId is null or non-Clerk (e.g. e2e_*)", async () => {
  __resetEnsureClerkNameCacheForTests();
  const fetchSpy = { count: 0 };
  const rows = [
    makeRow({ id: "u_1", clerkId: null }),
    makeRow({ id: "u_2", clerkId: "e2e_abc" }),
  ];
  await ensureUserNamesFromClerk(rows, makeDeps({ fetchSpy }));
  assert.equal(fetchSpy.count, 0);
});

test("does not write or mutate when Clerk also has no name", async () => {
  __resetEnsureClerkNameCacheForTests();
  const updateSpy = { calls: [] as Array<{ id: string; firstName: string; lastName: string }> };
  const row = makeRow({ id: "u_1", clerkId: "user_a" });
  await ensureUserNamesFromClerk(
    [row],
    makeDeps({ clerk: { user_a: { firstName: null, lastName: null } }, updateSpy }),
  );
  assert.equal(row.firstName, "");
  assert.equal(row.lastName, "");
  assert.equal(updateSpy.calls.length, 0);
});

test("Clerk fetch failure does not throw or mutate", async () => {
  __resetEnsureClerkNameCacheForTests();
  const row = makeRow({ id: "u_1", clerkId: "user_unknown" });
  await assert.doesNotReject(
    ensureUserNamesFromClerk([row], makeDeps({ clerk: {} })),
  );
  assert.equal(row.firstName, "");
});

test("throttles repeated attempts within TTL window", async () => {
  __resetEnsureClerkNameCacheForTests();
  const fetchSpy = { count: 0 };
  const deps = makeDeps({
    clerk: { user_a: { firstName: null, lastName: null } },
    fetchSpy,
  });
  const r1 = makeRow({ id: "u_1", clerkId: "user_a" });
  const r2 = makeRow({ id: "u_1", clerkId: "user_a" });
  await ensureUserNamesFromClerk([r1], deps);
  await ensureUserNamesFromClerk([r2], deps);
  assert.equal(fetchSpy.count, 1, "second call within TTL should be throttled");
});

test("trims whitespace from Clerk values", async () => {
  __resetEnsureClerkNameCacheForTests();
  const row = makeRow({ id: "u_1", clerkId: "user_a" });
  await ensureUserNamesFromClerk(
    [row],
    makeDeps({ clerk: { user_a: { firstName: "  Matt  ", lastName: "  Cardozo  " } } }),
  );
  assert.equal(row.firstName, "Matt");
  assert.equal(row.lastName, "Cardozo");
});

test("treats whitespace-only existing names as empty", async () => {
  __resetEnsureClerkNameCacheForTests();
  const fetchSpy = { count: 0 };
  const row = makeRow({ id: "u_1", clerkId: "user_a", firstName: "   ", lastName: "" });
  await ensureUserNamesFromClerk(
    [row],
    makeDeps({ clerk: { user_a: { firstName: "Matt", lastName: "Cardozo" } }, fetchSpy }),
  );
  assert.equal(fetchSpy.count, 1);
  assert.equal(row.firstName, "Matt");
});
