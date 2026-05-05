// Unit test for the user.updated payload → Prisma update map. Pins the
// fix for the not-null violation we hit in CloudWatch when Clerk sent
// `first_name: null` for an invitee who hadn't completed their profile.

import assert from "node:assert/strict";
import test from "node:test";
import { buildUserUpdateData } from "@/app/api/webhooks/clerk/build-user-update";

const baseEmail = [{ email_address: "matthewcar+stylist@wishi.me" }];

test("null first_name / last_name are skipped (no not-null violation)", () => {
  const out = buildUserUpdateData({
    email_addresses: baseEmail as never,
    first_name: null,
    last_name: null,
    image_url: undefined,
  } as never);
  assert.equal("firstName" in out, false);
  assert.equal("lastName" in out, false);
});

test("string first_name / last_name are written through", () => {
  const out = buildUserUpdateData({
    email_addresses: baseEmail as never,
    first_name: "Matt",
    last_name: "Cardozo",
    image_url: undefined,
  } as never);
  assert.equal(out.firstName, "Matt");
  assert.equal(out.lastName, "Cardozo");
});

test("empty-string first_name is treated as a real value", () => {
  // Clerk surfacing "" is intentional — user explicitly cleared it. We
  // honour that (writes empty string), unlike null where the field just
  // hasn't been set yet.
  const out = buildUserUpdateData({
    email_addresses: baseEmail as never,
    first_name: "",
    last_name: undefined,
    image_url: undefined,
  } as never);
  assert.equal(out.firstName, "");
});

test("null image_url is written through (avatarUrl is nullable)", () => {
  const out = buildUserUpdateData({
    email_addresses: baseEmail as never,
    first_name: undefined,
    last_name: undefined,
    image_url: null,
  } as never);
  assert.equal(out.avatarUrl, null);
});

test("undefined image_url is omitted (don't overwrite with undefined)", () => {
  const out = buildUserUpdateData({
    email_addresses: baseEmail as never,
    first_name: undefined,
    last_name: undefined,
    image_url: undefined,
  } as never);
  assert.equal("avatarUrl" in out, false);
});

test("email is taken from the first email address", () => {
  const out = buildUserUpdateData({
    email_addresses: [
      { email_address: "primary@example.com" },
      { email_address: "secondary@example.com" },
    ] as never,
    first_name: undefined,
    last_name: undefined,
    image_url: undefined,
  } as never);
  assert.equal(out.email, "primary@example.com");
});

test("missing email_addresses leaves email unset", () => {
  const out = buildUserUpdateData({
    email_addresses: undefined,
    first_name: undefined,
    last_name: undefined,
    image_url: undefined,
  } as never);
  assert.equal("email" in out, false);
});

test("lastLoginAt is always set", () => {
  const out = buildUserUpdateData({
    email_addresses: undefined,
    first_name: undefined,
    last_name: undefined,
    image_url: undefined,
  } as never);
  assert.ok(out.lastLoginAt instanceof Date);
});
