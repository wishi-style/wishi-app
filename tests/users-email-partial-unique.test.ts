/**
 * Integration test for the partial unique on `users.email`.
 *
 * Pre-2026-05-08 the schema carried a strict UNIQUE(email), so a soft-deleted
 * row permanently locked its email from re-signup — `reconcileClerkUser`
 * threw P2002 inside the Clerk webhook and the new user was left with empty
 * publicMetadata + no DB row (the lia@wishi.me incident).
 *
 * After 20260508120000_users_email_partial_unique the constraint is
 * `UNIQUE (email) WHERE deleted_at IS NULL`, so:
 *   - two active rows with the same email still collide (correct),
 *   - a soft-deleted row no longer blocks a fresh active row,
 *   - looking up "the" user by email must filter by `deletedAt: null`
 *     (no longer a `findUnique` candidate).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import { prisma } from "@/lib/prisma";

// This suite needs a real DB connection (it exercises the partial unique
// index applied in 20260508120000_users_email_partial_unique). Any DB with
// the latest migrations works — local dev `wishi`, the phase-suite DBs,
// CI's ephemeral instance. Skip only when DATABASE_URL is absent.
const integrationTest = process.env.DATABASE_URL ? test : test.skip;

function freshEmail(): string {
  return `partial-unique-${randomUUID().slice(0, 8)}@e2e.wishi.test`;
}

async function cleanupByEmail(email: string): Promise<void> {
  await prisma.user.deleteMany({ where: { email } });
}

integrationTest(
  "users.email: soft-deleted row does not block a fresh active signup with the same email",
  async () => {
    const email = freshEmail();
    try {
      // 1. Original signup → live row.
      const original = await prisma.user.create({
        data: {
          clerkId: `e2e_${randomUUID().slice(0, 12)}`,
          email,
          firstName: "Original",
          lastName: "User",
          authProvider: "EMAIL",
          referralCode: `REF${randomUUID().slice(0, 8).toUpperCase()}`,
        },
        select: { id: true },
      });

      // 2. Soft-delete it (mirrors the production `user.deleted` webhook).
      await prisma.user.update({
        where: { id: original.id },
        data: { deletedAt: new Date() },
      });

      // 3. Re-signup with the same email — pre-fix this threw P2002.
      const resignup = await prisma.user.create({
        data: {
          clerkId: `e2e_${randomUUID().slice(0, 12)}`,
          email,
          firstName: "Resignup",
          lastName: "User",
          authProvider: "EMAIL",
          referralCode: `REF${randomUUID().slice(0, 8).toUpperCase()}`,
        },
        select: { id: true },
      });

      assert.notEqual(resignup.id, original.id, "re-signup must be a new row");

      // 4. Both rows coexist; only the resignup is active.
      const all = await prisma.user.findMany({
        where: { email },
        select: { id: true, deletedAt: true },
      });
      assert.equal(all.length, 2, "exactly two rows for this email");
      const active = all.filter((u) => u.deletedAt === null);
      assert.equal(active.length, 1, "exactly one active row");
      assert.equal(active[0].id, resignup.id);
    } finally {
      await cleanupByEmail(email);
    }
  },
);

integrationTest(
  "users.email: two ACTIVE rows with the same email still collide",
  async () => {
    const email = freshEmail();
    try {
      await prisma.user.create({
        data: {
          clerkId: `e2e_${randomUUID().slice(0, 12)}`,
          email,
          firstName: "First",
          lastName: "Active",
          authProvider: "EMAIL",
          referralCode: `REF${randomUUID().slice(0, 8).toUpperCase()}`,
        },
      });

      await assert.rejects(
        prisma.user.create({
          data: {
            clerkId: `e2e_${randomUUID().slice(0, 12)}`,
            email,
            firstName: "Second",
            lastName: "Active",
            authProvider: "EMAIL",
            referralCode: `REF${randomUUID().slice(0, 8).toUpperCase()}`,
          },
        }),
        /Unique constraint failed/,
      );
    } finally {
      await cleanupByEmail(email);
    }
  },
);
