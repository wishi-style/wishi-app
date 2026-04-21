import assert from "node:assert/strict";
import test from "node:test";
import { parseOpenGraph } from "@/lib/closet/scrape-from-url";

test("parseOpenGraph extracts a Nordstrom-shaped product page", () => {
  const html = `
    <html><head>
      <meta property="og:title" content="Silk Slip Dress" />
      <meta property="og:image" content="https://n.nordstrommedia.com/id/dress.jpg" />
      <meta property="og:site_name" content="Nordstrom" />
      <meta property="product:brand" content="The Row" />
    </head></html>`;
  const og = parseOpenGraph(html);
  assert.equal(og.title, "Silk Slip Dress");
  assert.equal(og.imageUrl, "https://n.nordstrommedia.com/id/dress.jpg");
  assert.equal(og.siteName, "Nordstrom");
  assert.equal(og.brand, "The Row");
});

test("parseOpenGraph falls back to og:image:secure_url when og:image is absent", () => {
  const html = `
    <meta property="og:image:secure_url" content="https://secure.example.com/x.jpg" />`;
  const og = parseOpenGraph(html);
  assert.equal(og.imageUrl, "https://secure.example.com/x.jpg");
});

test("parseOpenGraph falls back to <meta name=\"title\"> and \"brand\"", () => {
  const html = `
    <meta name="title" content="Plain Title">
    <meta name="brand" content="Plain Brand">`;
  const og = parseOpenGraph(html);
  assert.equal(og.title, "Plain Title");
  assert.equal(og.brand, "Plain Brand");
});

test("parseOpenGraph returns nulls for empty/unparseable HTML", () => {
  const og = parseOpenGraph("<html><body>nothing</body></html>");
  assert.equal(og.title, null);
  assert.equal(og.imageUrl, null);
  assert.equal(og.siteName, null);
  assert.equal(og.brand, null);
});

test("parseOpenGraph is case-insensitive on attribute names", () => {
  const html = `<META PROPERTY="og:title" CONTENT="Shouty Title" />`;
  assert.equal(parseOpenGraph(html).title, "Shouty Title");
});

test("parseOpenGraph handles single-quoted attribute values", () => {
  const html = `<meta property='og:title' content='Quoted Title' />`;
  assert.equal(parseOpenGraph(html).title, "Quoted Title");
});
