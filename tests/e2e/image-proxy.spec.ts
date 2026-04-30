import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  getPool,
  disconnectTestDb,
} from "./db";

test.afterAll(async () => {
  await disconnectTestDb();
});

test.describe("/api/images/[...key] proxy", () => {
  test("public prefixes (inspiration/, avatars/, boards/) don't require auth — 200 or 404, never 401", async ({
    request,
  }) => {
    // We can't assert 200 without seeded S3 bytes (CI doesn't have AWS creds).
    // What we can assert: the route reaches S3 GetObject (404 NoSuchKey), it
    // doesn't bounce off Clerk's auth.protect() with a 401/HTML redirect.
    const cases = [
      "/api/images/inspiration/does-not-exist.jpg",
      "/api/images/avatars/does-not-exist.jpg",
      "/api/images/boards/does-not-exist.jpg",
    ];
    for (const url of cases) {
      const res = await request.get(url, { maxRedirects: 0 });
      expect([200, 404]).toContain(res.status());
      // If Clerk had blanket-blocked, status would be 401 + HTML body. The
      // route handler returns JSON.
      const ct = res.headers()["content-type"] ?? "";
      if (res.status() === 404) expect(ct).toContain("application/json");
    }
  });

  test("authed prefixes (closet/, chat/) return 401 when anonymous", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/images/closet/some-user/some-key.jpg",
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  test("unrecognised prefixes 404", async ({ request }) => {
    const res = await request.get(
      "/api/images/secrets/very-secret-key.txt",
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(404);
  });

  test("authed prefix flips to S3 lookup when signed in (404 NoSuchKey, not 401)", async ({
    browser,
  }) => {
    const ts = Date.now() + Math.floor(Math.random() * 1000);
    const email = `imgproxy-${ts}@e2e.wishi.test`;
    await ensureClientUser({
      clerkId: `e2e_imgproxy_${ts}`,
      email,
      firstName: "Img",
      lastName: "Proxy",
    });
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(email);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).not.toHaveURL(/\/sign-in/);

      const res = await page.request.get(
        `/api/images/closet/${randomUUID()}/${randomUUID()}.jpg`,
        { maxRedirects: 0 },
      );
      expect([200, 404]).toContain(res.status());
      // Past the auth gate; if it had been blocked we'd get 401.
      expect(res.status()).not.toBe(401);
      await ctx.close();
    } finally {
      await cleanupE2EUserByEmail(email);
      // Don't leak fixtures — getPool is idempotent
      void getPool;
    }
  });
});
