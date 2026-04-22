// Integration test for src/lib/closet/scrape-from-url.ts. Stubs globalThis.fetch
// to return canned HTML so we can exercise the full pipeline (URL safety
// check → fetch → parse → ClosetItem write) without hitting a real retailer.
//
// We use a literal public IP (1.1.1.1) for the URL so assertPublicHttpUrl
// skips DNS lookup AND passes the SSRF check (1.1.1.1 isn't in any private
// range). The HTML response intentionally omits og:image so the S3 upload
// branch is skipped — the resulting ClosetItem is `partial: true` but that's
// the documented behavior we want to verify.

import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  getPool,
} from "./e2e/db";
import { scrapeFromUrl } from "@/lib/closet/scrape-from-url";

const ORIGINAL_FETCH = globalThis.fetch;
const cleanups: Array<() => Promise<void>> = [];

beforeEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

afterEach(async () => {
  globalThis.fetch = ORIGINAL_FETCH;
  while (cleanups.length) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

function mockFetchHTML(html: string) {
  globalThis.fetch = async () =>
    new Response(html, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
}

async function setupUser() {
  const suffix = randomUUID().slice(0, 8);
  const email = `scrape-${suffix}@example.com`;
  const user = await ensureClientUser({
    clerkId: `scrape-${suffix}`,
    email,
    firstName: "Scrape",
    lastName: "User",
  });
  cleanups.push(async () => {
    await getPool().query(`DELETE FROM closet_items WHERE user_id = $1`, [user.id]);
    await cleanupE2EUserByEmail(email);
  });
  return user;
}

test("scrapeFromUrl creates a ClosetItem from a Nordstrom-shaped page", async () => {
  const user = await setupUser();
  mockFetchHTML(`
    <html><head>
      <meta property="og:title" content="Silk Slip Dress" />
      <meta property="og:site_name" content="Nordstrom" />
      <meta property="product:brand" content="The Row" />
    </head></html>
  `);

  const { closetItem, partial } = await scrapeFromUrl({
    userId: user.id,
    url: "http://1.1.1.1/silk-dress",
    category: "Dresses",
  });

  assert.equal(closetItem.name, "Silk Slip Dress");
  assert.equal(closetItem.designer, "The Row");
  assert.equal(closetItem.category, "Dresses");
  assert.equal(closetItem.userId, user.id);
  // No og:image was supplied, so partial=true and url defaults to "".
  assert.equal(partial, true);

  // Verify it actually landed in Postgres.
  const { rows } = await getPool().query(
    `SELECT name, designer, category FROM closet_items WHERE id = $1`,
    [closetItem.id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Silk Slip Dress");
});

test("scrapeFromUrl normalizes designer casing via taxonomy.normalizeDesigner", async () => {
  const user = await setupUser();
  mockFetchHTML(`
    <html><head>
      <meta property="og:title" content="Cardigan" />
      <meta property="product:brand" content="loro piana" />
    </head></html>
  `);

  const { closetItem } = await scrapeFromUrl({
    userId: user.id,
    url: "http://1.1.1.1/cardigan",
  });

  assert.equal(closetItem.designer, "Loro Piana");
});

test("scrapeFromUrl falls back to og:site_name when product:brand is absent", async () => {
  const user = await setupUser();
  mockFetchHTML(`
    <html><head>
      <meta property="og:title" content="Mystery Item" />
      <meta property="og:site_name" content="ssense" />
    </head></html>
  `);

  const { closetItem } = await scrapeFromUrl({
    userId: user.id,
    url: "http://1.1.1.1/mystery",
  });

  assert.equal(closetItem.designer, "Ssense");
});

test("scrapeFromUrl returns partial=true on empty HTML", async () => {
  const user = await setupUser();
  mockFetchHTML(`<html><body>nothing useful</body></html>`);

  const { closetItem, partial } = await scrapeFromUrl({
    userId: user.id,
    url: "http://1.1.1.1/empty",
  });

  assert.equal(partial, true);
  assert.equal(closetItem.name, null);
  assert.equal(closetItem.designer, null);
});

test("scrapeFromUrl rejects URLs that resolve to private ranges", async () => {
  const user = await setupUser();
  // 127.0.0.1 is loopback — assertPublicHttpUrl must reject before fetch.
  // We don't even need to mock fetch here.
  await assert.rejects(
    scrapeFromUrl({ userId: user.id, url: "http://127.0.0.1/x" }),
    /unsafe url/i,
  );

  // Confirm no ClosetItem was created.
  const { rows } = await getPool().query(
    `SELECT id FROM closet_items WHERE user_id = $1`,
    [user.id],
  );
  assert.equal(rows.length, 0);
});
