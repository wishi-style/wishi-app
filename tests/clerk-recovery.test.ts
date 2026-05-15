import assert from "node:assert/strict";
import test from "node:test";

import {
  CLERK_RECOVERY_MARKER,
  CLERK_RECOVERY_MARKER_VALUE,
  buildClerkRecoveryUrl,
} from "@/lib/auth/clerk-recovery";

const APP_URL = "https://d2mt49xs07o9rr.cloudfront.net";
const RETURN_PATH = "/bookings/success?session_id=cs_test_xyz";

function makeDeps(overrides: {
  user?: { clerkId: string | null; deletedAt: Date | null } | null;
  token?: string;
  throwOn?: "findUser" | "createToken";
} = {}) {
  return {
    findUserById: async () => {
      if (overrides.throwOn === "findUser") throw new Error("prisma boom");
      return "user" in overrides
        ? (overrides.user ?? null)
        : { clerkId: "clerk_abc", deletedAt: null };
    },
    createSignInToken: async () => {
      if (overrides.throwOn === "createToken") throw new Error("clerk boom");
      return { token: overrides.token ?? "tkt_signed" };
    },
  };
}

test("returns null when prismaUserId is missing", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: undefined,
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps(),
  });
  assert.equal(url, null);
});

test("returns null when prismaUserId is null", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: null,
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps(),
  });
  assert.equal(url, null);
});

test("returns null when prismaUserId is empty string", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: "",
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps(),
  });
  assert.equal(url, null);
});

test("returns null when user not found", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: "user_abc",
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps({ user: null }),
  });
  assert.equal(url, null);
});

test("returns null when user has no clerkId", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: "user_abc",
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps({ user: { clerkId: null, deletedAt: null } }),
  });
  assert.equal(url, null);
});

test("returns null when user is soft-deleted", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: "user_abc",
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps({
      user: { clerkId: "clerk_abc", deletedAt: new Date("2026-01-01") },
    }),
  });
  assert.equal(url, null);
});

test("returns null when DB lookup throws", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: "user_abc",
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps({ throwOn: "findUser" }),
  });
  assert.equal(url, null);
});

test("returns null when Clerk token creation throws", async () => {
  const url = await buildClerkRecoveryUrl({
    prismaUserId: "user_abc",
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps({ throwOn: "createToken" }),
  });
  assert.equal(url, null);
});

test("builds /sign-in URL with __clerk_ticket and loop-guarded redirect_url", async () => {
  const raw = await buildClerkRecoveryUrl({
    prismaUserId: "user_abc",
    appUrl: APP_URL,
    returnPath: RETURN_PATH,
    deps: makeDeps({ token: "tkt_signed_value" }),
  });
  assert.ok(raw, "expected a recovery URL");

  const url = new URL(raw!);
  assert.equal(url.origin, APP_URL);
  assert.equal(url.pathname, "/sign-in");
  assert.equal(url.searchParams.get("__clerk_ticket"), "tkt_signed_value");

  const redirectRaw = url.searchParams.get("redirect_url");
  assert.ok(redirectRaw, "redirect_url should be set");

  // redirect_url is path+search (no origin) — Clerk re-resolves origin from
  // current host so this stays correct across staging / prod / preview.
  assert.ok(
    redirectRaw!.startsWith("/bookings/success"),
    `expected /bookings/success prefix, got: ${redirectRaw}`,
  );

  const redirectUrl = new URL(redirectRaw!, APP_URL);
  assert.equal(redirectUrl.pathname, "/bookings/success");
  assert.equal(redirectUrl.searchParams.get("session_id"), "cs_test_xyz");
  assert.equal(
    redirectUrl.searchParams.get(CLERK_RECOVERY_MARKER),
    CLERK_RECOVERY_MARKER_VALUE,
  );
});

test("preserves arbitrary query params on the returnPath", async () => {
  const raw = await buildClerkRecoveryUrl({
    prismaUserId: "user_abc",
    appUrl: APP_URL,
    returnPath:
      "/bookings/success?session_id=cs_test_xyz&utm_source=email&affiliate=partner_xyz",
    deps: makeDeps(),
  });
  assert.ok(raw);

  const url = new URL(raw!);
  const redirectRaw = url.searchParams.get("redirect_url");
  const redirectUrl = new URL(redirectRaw!, APP_URL);
  assert.equal(redirectUrl.searchParams.get("utm_source"), "email");
  assert.equal(redirectUrl.searchParams.get("affiliate"), "partner_xyz");
  assert.equal(redirectUrl.searchParams.get("session_id"), "cs_test_xyz");
  assert.equal(
    redirectUrl.searchParams.get(CLERK_RECOVERY_MARKER),
    CLERK_RECOVERY_MARKER_VALUE,
  );
});
