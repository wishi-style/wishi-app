// Integration test for POST /api/promo-codes/validate. Seeds a PromoCode
// row directly (no Stripe), then hits the route handler in-process and
// asserts the response shape + that usedCount stays put (validate must
// not consume).

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/promo-codes/validate/route";

const codes: string[] = [];

afterEach(async () => {
  while (codes.length > 0) {
    const code = codes.pop()!;
    await prisma.promoCode.deleteMany({ where: { code } });
  }
});

function jsonReq(body: unknown): Request {
  return new Request("http://test/api/promo-codes/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("validate returns AMOUNT discount capped at base price", async () => {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `AMT-${suffix}`;
  await prisma.promoCode.create({
    data: {
      code,
      creditType: "SESSION",
      discountType: "AMOUNT",
      discountValue: 55000, // $550
      isActive: true,
    },
  });
  codes.push(code);

  const res = await POST(jsonReq({ code, creditType: "SESSION", basePriceInCents: 6000 }));
  const json = await res.json();
  assert.equal(json.valid, true);
  assert.equal(json.discountType, "AMOUNT");
  assert.equal(json.discountValue, 55000);
  assert.equal(json.discountInCents, 6000); // capped at base

  // usedCount must be untouched.
  const after = await prisma.promoCode.findUniqueOrThrow({ where: { code } });
  assert.equal(after.usedCount, 0);
});

test("validate returns PERCENT discount as computed cents", async () => {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `PCT-${suffix}`;
  await prisma.promoCode.create({
    data: {
      code,
      creditType: "SESSION",
      discountType: "PERCENT",
      discountValue: 25,
      isActive: true,
    },
  });
  codes.push(code);

  const res = await POST(jsonReq({ code, creditType: "SESSION", basePriceInCents: 13000 }));
  const json = await res.json();
  assert.equal(json.valid, true);
  assert.equal(json.discountType, "PERCENT");
  assert.equal(json.discountValue, 25);
  assert.equal(json.discountInCents, 3250);
});

test("validate rejects mismatched creditType", async () => {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `XMATCH-${suffix}`;
  await prisma.promoCode.create({
    data: {
      code,
      creditType: "SHOPPING",
      discountType: "AMOUNT",
      discountValue: 1000,
      isActive: true,
    },
  });
  codes.push(code);

  const res = await POST(jsonReq({ code, creditType: "SESSION", basePriceInCents: 6000 }));
  const json = await res.json();
  assert.equal(json.valid, false);
  assert.match(json.reason, /shopping/i);
});

test("validate rejects exhausted code", async () => {
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  const code = `EXH-${suffix}`;
  await prisma.promoCode.create({
    data: {
      code,
      creditType: "SESSION",
      discountType: "AMOUNT",
      discountValue: 1000,
      usageLimit: 1,
      usedCount: 1,
      isActive: true,
    },
  });
  codes.push(code);

  const res = await POST(jsonReq({ code, creditType: "SESSION", basePriceInCents: 6000 }));
  const json = await res.json();
  assert.equal(json.valid, false);
  assert.match(json.reason, /redeemed/i);
});

test("validate rejects unknown code without leaking existence", async () => {
  const res = await POST(jsonReq({
    code: "DEFINITELY-NOT-A-REAL-CODE",
    creditType: "SESSION",
    basePriceInCents: 6000,
  }));
  const json = await res.json();
  assert.equal(json.valid, false);
});
