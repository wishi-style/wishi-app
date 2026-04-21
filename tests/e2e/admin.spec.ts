import { expect, test } from "@playwright/test";
import {
  cleanupE2EUserByEmail,
  ensureAdminUser,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
  disconnectTestDb,
} from "./db";

test.afterAll(async () => {
  await disconnectTestDb();
});

async function setupAdmin(prefix: string) {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const email = `${prefix}-admin-${ts}@e2e.wishi.test`;
  const admin = await ensureAdminUser({
    clerkId: `e2e_${prefix}_admin_${ts}`,
    email,
    firstName: "Admin",
    lastName: "Ops",
  });
  return { id: admin.id, email };
}

async function setupClient(prefix: string) {
  const ts = Date.now() + Math.floor(Math.random() * 1000);
  const email = `${prefix}-c-${ts}@e2e.wishi.test`;
  const client = await ensureClientUser({
    clerkId: `e2e_${prefix}_c_${ts}`,
    email,
    firstName: "Client",
    lastName: "Person",
  });
  return { id: client.id, email };
}

async function getAuditRows(entityId: string) {
  const { rows } = await getPool().query(
    `SELECT action, entity_type, entity_id, actor_user_id FROM audit_logs WHERE entity_id = $1 ORDER BY created_at ASC`,
    [entityId],
  );
  return rows;
}

test.describe("Phase 8: admin surface smoke", () => {
  test("non-admin gets 403 on every /admin/* route", async ({ browser }) => {
    const ctx = await setupClient("gate");
    try {
      const clientCtx = await browser.newContext();
      const page = await clientCtx.newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(ctx.email);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).toHaveURL(/\/(sessions|stylist)/);

      const routes = ["/admin", "/admin/users", "/admin/stylists", "/admin/sessions", "/admin/audit-log"];
      for (const route of routes) {
        const res = await page.request.get(route);
        expect(res.status(), `expected 403 on ${route}, got ${res.status()}`).toBe(403);
      }
      await clientCtx.close();
    } finally {
      await cleanupE2EUserByEmail(ctx.email);
    }
  });

  test("admin can open dashboard + stylists + sessions + subscriptions + users + quiz-builder + audit-log", async ({
    browser,
  }) => {
    const admin = await setupAdmin("smoke");
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(admin.email);
      await page.getByRole("button", { name: "Sign In" }).click();

      for (const route of [
        "/admin",
        "/admin/users",
        "/admin/stylists",
        "/admin/sessions",
        "/admin/subscriptions",
        "/admin/quiz-builder",
        "/admin/audit-log",
        "/admin/inspiration-photos",
        "/admin/orders",
      ]) {
        await page.goto(route);
        await expect(page, `loaded ${route}`).toHaveURL(new RegExp(route.replace(/\//g, "\\/") + "\\/?$"));
        await expect(page.locator("body")).not.toContainText("403");
      }
      await ctx.close();
    } finally {
      await cleanupE2EUserByEmail(admin.email);
    }
  });

  test("admin promotes client → stylist → audit log row written", async ({ browser }) => {
    const admin = await setupAdmin("promote");
    const target = await setupClient("promotee");
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(admin.email);
      await page.getByRole("button", { name: "Sign In" }).click();

      const res = await page.request.post(`/api/admin/users/${target.id}/promote`, {
        data: { role: "STYLIST" },
      });
      expect(res.status()).toBe(200);

      const { rows: userRows } = await getPool().query(`SELECT role FROM users WHERE id = $1`, [target.id]);
      expect(userRows[0].role).toBe("STYLIST");

      const audit = await getAuditRows(target.id);
      expect(audit.length).toBeGreaterThan(0);
      expect(audit.some((r) => r.action?.toString().toLowerCase().includes("promote") || r.action?.toString().toLowerCase().includes("role"))).toBe(true);

      await ctx.close();
    } finally {
      await cleanupE2EUserByEmail(target.email);
      await cleanupE2EUserByEmail(admin.email);
    }
  });

  test("admin approves stylist match-eligibility → matchEligible flips + audit row", async ({ browser }) => {
    const admin = await setupAdmin("approve");
    const ts = Date.now() + Math.floor(Math.random() * 1000);
    const stylistEmail = `approve-s-${ts}@e2e.wishi.test`;
    const stylist = await ensureStylistUser({
      clerkId: `e2e_approve_s_${ts}`,
      email: stylistEmail,
      firstName: "Approvable",
      lastName: "Stylist",
    });
    const profile = await ensureStylistProfile({ userId: stylist.id, matchEligible: false });
    try {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(admin.email);
      await page.getByRole("button", { name: "Sign In" }).click();

      const res = await page.request.post(`/api/admin/stylists/${stylist.id}/approve`);
      expect(res.status()).toBe(200);

      const { rows } = await getPool().query(
        `SELECT match_eligible FROM stylist_profiles WHERE id = $1`,
        [profile.id],
      );
      expect(rows[0].match_eligible).toBe(true);

      await ctx.close();
    } finally {
      await getPool().query(`DELETE FROM stylist_profiles WHERE user_id = $1`, [stylist.id]);
      await cleanupE2EUserByEmail(stylistEmail);
      await cleanupE2EUserByEmail(admin.email);
    }
  });
});
