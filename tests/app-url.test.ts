import assert from "node:assert/strict";
import test from "node:test";
import { resolveAppUrl } from "@/lib/app-url";

test("prefers APP_URL when it is configured", () => {
  const headers = new Headers({
    origin: "https://ignored.example.com",
  });

  assert.equal(
    resolveAppUrl({
      envAppUrl: "https://app.example.com/",
      headers,
    }),
    "https://app.example.com"
  );
});

test("falls back to the request origin when APP_URL is missing", () => {
  const headers = new Headers({
    origin: "https://preview.example.com",
  });

  assert.equal(resolveAppUrl({ headers }), "https://preview.example.com");
});

test("builds an absolute URL from forwarded host headers", () => {
  const headers = new Headers({
    "x-forwarded-host": "wishi.example.com",
    "x-forwarded-proto": "https",
  });

  assert.equal(resolveAppUrl({ headers }), "https://wishi.example.com");
});

test("uses http for localhost hosts when no protocol header is present", () => {
  const headers = new Headers({
    host: "localhost:3000",
  });

  assert.equal(resolveAppUrl({ headers }), "http://localhost:3000");
});
