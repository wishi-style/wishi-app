import { expect, test, type Page } from "@playwright/test";
import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  cleanupStylistProfile,
  cleanupE2EUserByEmail,
} from "./db";
import {
  installFailureGuards,
  expectNoErrorBoundary,
  gotoAndAssertOk,
} from "./fixtures/traversal";

/**
 * Link crawler — visits every "starting" page (marketing + authed nav),
 * collects every internal `<a href>` it finds, then navigates to each
 * unique href and asserts the destination renders without bouncing to
 * the global error boundary.
 *
 * Why this spec exists: the original /stylists/[id] crash and the
 * /pricing → /welcome crash both shipped because earlier specs
 * asserted that CTAs were *visible* but never *clicked* them. This
 * crawler closes that loop systematically — visibility is not the same
 * as reachability, and a `<a href="/welcome">` that renders cleanly
 * proves nothing about whether /welcome itself works.
 *
 * Scope: only same-origin `/...` hrefs. Hash anchors (`#section`),
 * external `https://...`, `mailto:`, and `/api/...` are skipped — those
 * aren't user-navigable destinations in the page-render sense.
 *
 * Bounded so it can't run forever: each crawler test caps the unique
 * href set it visits, and dedups by exact href string.
 */

const SKIP_HREFS = new Set<string>([
  // Logout / destructive actions — not clickable as plain links here.
  "/sign-out",
]);

const SKIP_PREFIXES = [
  "/api/", // server endpoints, not pages
  "//", // protocol-relative URLs to external hosts
];

interface CrawlOptions {
  /** Maximum unique hrefs to visit. Bounds wall-clock time. */
  maxLinks?: number;
}

async function collectHrefs(page: Page): Promise<string[]> {
  return page.locator("a[href]").evaluateAll((els) =>
    els
      .map((el) => (el as HTMLAnchorElement).getAttribute("href"))
      .filter((h): h is string => Boolean(h)),
  );
}

function shouldVisit(href: string): boolean {
  if (!href || !href.startsWith("/")) return false;
  if (href.startsWith("#")) return false;
  if (SKIP_HREFS.has(href)) return false;
  for (const prefix of SKIP_PREFIXES) {
    if (href.startsWith(prefix)) return false;
  }
  return true;
}

async function crawlAndAssertReachable(
  page: Page,
  startingPages: string[],
  options: CrawlOptions = {},
): Promise<{ visited: string[]; broken: Array<{ href: string; reason: string }> }> {
  const { maxLinks = 80 } = options;
  const collected = new Set<string>();

  // Walk the starting set and collect every internal href on each page.
  for (const start of startingPages) {
    await gotoAndAssertOk(page, start);
    const hrefs = await collectHrefs(page);
    for (const h of hrefs) {
      if (shouldVisit(h)) collected.add(h);
    }
  }

  // Bound the work — fail fast if the page is link-spammy.
  const candidates = Array.from(collected).slice(0, maxLinks);
  const visited: string[] = [];
  const broken: Array<{ href: string; reason: string }> = [];

  for (const href of candidates) {
    const response = await page.goto(href).catch((err) => {
      broken.push({ href, reason: `goto failed: ${err.message}` });
      return null;
    });
    if (!response) continue;
    await page.waitForLoadState("networkidle").catch(() => null);

    const status = response.status();
    if (status >= 500) {
      broken.push({ href, reason: `HTTP ${status}` });
      continue;
    }

    // Body-text assertion is the actual reachability check — Next can
    // serve error.tsx with a 200 status, so HTTP code alone isn't enough.
    const body = await page.locator("body").innerText().catch(() => "");
    if (/Something went wrong/i.test(body)) {
      broken.push({ href, reason: "rendered global error boundary" });
      continue;
    }
    if (/^Try again$/m.test(body) && /Reference:/i.test(body)) {
      // Defense in depth: the root error.tsx always renders the digest
      // reference line. Catches the boundary even if the heading copy
      // changes in a future redesign.
      broken.push({ href, reason: "rendered error boundary digest" });
      continue;
    }

    visited.push(href);
  }

  return { visited, broken };
}

test.describe("link crawler — every internal href on canonical pages reaches a renderable destination", () => {
  // The crawler walks 15+ starting pages and visits every internal href
  // it finds — easily 30+ goto calls per test. Default 30s timeout isn't
  // enough; budget 3 minutes per test to keep wall-clock realistic.
  test.setTimeout(180_000);

  test("anon crawls every link surfaced from the marketing pages", async ({
    page,
  }) => {
    installFailureGuards(page);

    // Seed a stylist so /stylists has at least one card whose link the
    // crawler can collect. Without a seeded stylist the directory shows
    // an empty grid and the crawler can't reach /stylists/[id].
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const stylistEmail = `crawl-anon-${stamp}@e2e.wishi.test`;
    const stylist = await ensureStylistUser({
      clerkId: `e2e_crawl_anon_${stamp}`,
      email: stylistEmail,
      firstName: "Crawler",
      lastName: "Seed",
    });
    const profile = await ensureStylistProfile({ userId: stylist.id });

    try {
      const { visited, broken } = await crawlAndAssertReachable(
        page,
        ["/", "/pricing", "/how-it-works", "/lux", "/feed", "/reviews", "/gift-cards", "/stylists"],
      );

      // Sanity floor: if the crawler somehow visits zero hrefs the
      // assertion below is meaningless. The marketing pages alone link
      // to ~10+ unique surfaces.
      expect(
        visited.length,
        `crawler should reach a meaningful number of pages — only got [${visited.join(", ")}]`,
      ).toBeGreaterThan(5);

      // The actual reachability check.
      expect(
        broken,
        `Broken links found:\n${broken.map((b) => `  ${b.href} → ${b.reason}`).join("\n")}`,
      ).toEqual([]);

      // Sanity: the seeded stylist's profile was reached (proves the
      // crawler can hop across `/stylists` → `/stylists/[id]`).
      expect(visited.some((h) => h.includes(profile.id))).toBe(true);
    } finally {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(stylistEmail);
    }
  });

  test("authed client crawls every link surfaced from the marketing + authed nav", async ({
    page,
  }) => {
    installFailureGuards(page);

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const clientEmail = `crawl-authed-${stamp}@e2e.wishi.test`;
    const stylistEmail = `crawl-stylist-${stamp}@e2e.wishi.test`;

    await ensureClientUser({
      clerkId: `e2e_crawl_authed_${stamp}`,
      email: clientEmail,
      firstName: "Crawl",
      lastName: "Walker",
    });
    const stylist = await ensureStylistUser({
      clerkId: `e2e_crawl_authed_styl_${stamp}`,
      email: stylistEmail,
      firstName: "Crawler",
      lastName: "Seed",
    });
    await ensureStylistProfile({ userId: stylist.id });

    try {
      // Sign in via the e2e backdoor.
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(clientEmail);
      await page.getByRole("button", { name: "Sign In" }).click();
      await expect(page).toHaveURL(/\/(sessions|stylist|match-quiz|matches|welcome)/);

      const { visited, broken } = await crawlAndAssertReachable(
        page,
        [
          // Marketing pages stay reachable while authed and may surface
          // different chrome/CTAs (e.g. "My Style Sessions" navbar link).
          "/",
          "/pricing",
          "/how-it-works",
          "/lux",
          "/feed",
          "/reviews",
          "/gift-cards",
          "/stylists",
          // Authed nav surfaces — every (client) route an authed user
          // can navigate to from the navbar or settings grid.
          "/sessions",
          "/settings",
          "/cart",
          "/orders",
          "/profile",
          "/favorites",
          "/matches",
        ],
      );

      expect(
        visited.length,
        `crawler should reach a meaningful number of pages — only got [${visited.join(", ")}]`,
      ).toBeGreaterThan(10);

      expect(
        broken,
        `Broken links found:\n${broken.map((b) => `  ${b.href} → ${b.reason}`).join("\n")}`,
      ).toEqual([]);
    } finally {
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    }
  });
});
