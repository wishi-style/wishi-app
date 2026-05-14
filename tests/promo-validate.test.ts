// Unit tests for the client-facing promo validator powering the session
// checkout Apply button + the server-side re-validation in `runCheckout`.
// Hits the real Postgres connection (DATABASE_URL) — no Stripe calls; the
// stripeCouponId is recorded only as a string passthrough.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { validateForCheckout } from "@/lib/promotions/promo-code.service";

const CODE_PREFIX = "PROMO-VALIDATE-TEST-";
const codes: string[] = [];

afterEach(async () => {
  if (codes.length === 0) return;
  await prisma.promoCode.deleteMany({ where: { code: { in: codes } } });
  codes.length = 0;
});

async function seedPromo(overrides: {
  code: string;
  creditType?: "SESSION" | "SHOPPING";
  amountInCents?: number;
  isActive?: boolean;
  usageLimit?: number | null;
  usedCount?: number;
  expiresAt?: Date | null;
  stripeCouponId?: string | null;
}) {
  codes.push(overrides.code);
  return prisma.promoCode.create({
    data: {
      code: overrides.code,
      creditType: overrides.creditType ?? "SESSION",
      amountInCents: overrides.amountInCents ?? 5000,
      isActive: overrides.isActive ?? true,
      usageLimit: overrides.usageLimit ?? null,
      usedCount: overrides.usedCount ?? 0,
      expiresAt: overrides.expiresAt ?? null,
      stripeCouponId: overrides.stripeCouponId ?? null,
    },
  });
}

test("returns not_found for an unknown code", async () => {
  const result = await validateForCheckout(`${CODE_PREFIX}DOES-NOT-EXIST`);
  assert.deepEqual(result, { ok: false, reason: "not_found" });
});

test("returns not_found for an empty / whitespace-only code", async () => {
  assert.deepEqual(await validateForCheckout(""), { ok: false, reason: "not_found" });
  assert.deepEqual(await validateForCheckout("   "), { ok: false, reason: "not_found" });
});

test("returns inactive for a deactivated code", async () => {
  await seedPromo({ code: `${CODE_PREFIX}INACTIVE`, isActive: false });
  const result = await validateForCheckout(`${CODE_PREFIX}INACTIVE`);
  assert.deepEqual(result, { ok: false, reason: "inactive" });
});

test("returns expired for a code past its expiresAt", async () => {
  await seedPromo({
    code: `${CODE_PREFIX}EXPIRED`,
    expiresAt: new Date(Date.now() - 86400 * 1000),
  });
  const result = await validateForCheckout(`${CODE_PREFIX}EXPIRED`);
  assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("returns exhausted when usedCount >= usageLimit", async () => {
  await seedPromo({
    code: `${CODE_PREFIX}EXHAUSTED`,
    usageLimit: 2,
    usedCount: 2,
  });
  const result = await validateForCheckout(`${CODE_PREFIX}EXHAUSTED`);
  assert.deepEqual(result, { ok: false, reason: "exhausted" });
});

test("rejects SHOPPING-type codes at session checkout", async () => {
  await seedPromo({
    code: `${CODE_PREFIX}SHOPPING`,
    creditType: "SHOPPING",
  });
  const result = await validateForCheckout(`${CODE_PREFIX}SHOPPING`);
  assert.deepEqual(result, { ok: false, reason: "wrong_type" });
});

test("returns ok with canonical code + discount + coupon for a valid SESSION promo", async () => {
  await seedPromo({
    code: `${CODE_PREFIX}OK`,
    amountInCents: 7500,
    stripeCouponId: "coup_test_ok",
  });
  const result = await validateForCheckout(`${CODE_PREFIX}OK`);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.code, `${CODE_PREFIX}OK`);
    assert.equal(result.amountInCents, 7500);
    assert.equal(result.stripeCouponId, "coup_test_ok");
  }
});

test("lookup is case-insensitive", async () => {
  await seedPromo({
    code: `${CODE_PREFIX}LOWER`,
    amountInCents: 500,
    stripeCouponId: "coup_lower",
  });
  const result = await validateForCheckout(`${CODE_PREFIX}lower`.toLowerCase());
  assert.equal(result.ok, true);
});
