// Integration tests for the waitlist-notify worker.
// Payout-reconcile behavior is tested indirectly via the payout-webhooks tests
// in Phase 6a; the worker itself just calls retrieveTransfer + updates rows,
// which is hard to integration-test without seeding Stripe transfers.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  getPool,
} from "./e2e/db";

let client: { id: string };
let stylist: { id: string };

afterEach(async () => {
  if (client?.id) {
    await getPool().query(
      `DELETE FROM stylist_waitlist_entries WHERE user_id = $1`,
      [client.id]
    );
    await cleanupE2EUserByEmail(`worker-client-${client.id}@example.com`);
  }
  if (stylist?.id) {
    await getPool().query("DELETE FROM stylist_profiles WHERE user_id = $1", [stylist.id]);
    await cleanupE2EUserByEmail(`worker-stylist-${stylist.id}@example.com`);
  }
});

test("waitlist-notify flips PENDING → NOTIFIED for available + eligible stylists only", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `worker_c_${suffix}`,
    email: `worker-client-${suffix}@example.com`,
    firstName: "Worker",
    lastName: "Client",
  });
  stylist = await ensureStylistUser({
    clerkId: `worker_s_${suffix}`,
    email: `worker-stylist-${suffix}@example.com`,
    firstName: "Worker",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  // Make stylist available + eligible, insert PENDING waitlist entry.
  await getPool().query(
    `UPDATE stylist_profiles SET is_available = true, match_eligible = true WHERE user_id = $1`,
    [stylist.id]
  );
  const { rows: profileRows } = await getPool().query(
    `SELECT id FROM stylist_profiles WHERE user_id = $1`,
    [stylist.id]
  );
  await getPool().query(
    `INSERT INTO stylist_waitlist_entries (id, user_id, stylist_profile_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'PENDING', NOW(), NOW())`,
    [randomUUID(), client.id, profileRows[0].id]
  );

  const { runWaitlistNotify } = await import("@/workers/waitlist-notify");
  const result = await runWaitlistNotify();

  assert.ok(result.notified >= 1, `expected at least 1 notified, got ${result.notified}`);

  const { rows } = await getPool().query(
    `SELECT status, notified_at FROM stylist_waitlist_entries WHERE user_id = $1`,
    [client.id]
  );
  assert.equal(rows[0].status, "NOTIFIED");
  assert.ok(rows[0].notified_at instanceof Date);
});

test("waitlist-notify skips entries for stylists who are NOT available/eligible", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `worker2_c_${suffix}`,
    email: `worker-client-${suffix}@example.com`,
    firstName: "Worker",
    lastName: "Skip",
  });
  stylist = await ensureStylistUser({
    clerkId: `worker2_s_${suffix}`,
    email: `worker-stylist-${suffix}@example.com`,
    firstName: "Worker",
    lastName: "Offline",
  });
  await ensureStylistProfile({ userId: stylist.id });
  // Stylist NOT available — waitlist entry should stay PENDING.
  await getPool().query(
    `UPDATE stylist_profiles SET is_available = false, match_eligible = true WHERE user_id = $1`,
    [stylist.id]
  );
  const { rows: profileRows } = await getPool().query(
    `SELECT id FROM stylist_profiles WHERE user_id = $1`,
    [stylist.id]
  );
  await getPool().query(
    `INSERT INTO stylist_waitlist_entries (id, user_id, stylist_profile_id, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'PENDING', NOW(), NOW())`,
    [randomUUID(), client.id, profileRows[0].id]
  );

  const { runWaitlistNotify } = await import("@/workers/waitlist-notify");
  await runWaitlistNotify();

  const { rows } = await getPool().query(
    `SELECT status FROM stylist_waitlist_entries WHERE user_id = $1`,
    [client.id]
  );
  assert.equal(rows[0].status, "PENDING");
});

test("worker auth rejects missing/wrong secret", async () => {
  const { workerRequestAuthorized } = await import("@/lib/workers/auth");

  const originalSecret = process.env.WORKER_SHARED_SECRET;
  process.env.WORKER_SHARED_SECRET = "test-secret-123";

  const noHeader = new Request("http://localhost/api/workers/x");
  assert.equal(workerRequestAuthorized(noHeader), false);

  const wrongHeader = new Request("http://localhost/api/workers/x", {
    headers: { "x-worker-secret": "nope" },
  });
  assert.equal(workerRequestAuthorized(wrongHeader), false);

  const rightHeader = new Request("http://localhost/api/workers/x", {
    headers: { "x-worker-secret": "test-secret-123" },
  });
  assert.equal(workerRequestAuthorized(rightHeader), true);

  if (originalSecret) process.env.WORKER_SHARED_SECRET = originalSecret;
  else delete process.env.WORKER_SHARED_SECRET;
});

test("worker auth fails closed when WORKER_SHARED_SECRET is unset", async () => {
  const { workerRequestAuthorized } = await import("@/lib/workers/auth");

  const original = process.env.WORKER_SHARED_SECRET;
  delete process.env.WORKER_SHARED_SECRET;

  const req = new Request("http://localhost/api/workers/x", {
    headers: { "x-worker-secret": "anything" },
  });
  assert.equal(workerRequestAuthorized(req), false);

  if (original) process.env.WORKER_SHARED_SECRET = original;
});
