// Feed API cursor pagination burst — 50 concurrent users paginating
// `/api/feed` to verify the cursor-paginated query holds under load.
//
// Usage: BASE_URL=https://staging-url k6 run tests/load/feed-api.js

import http from "k6/http";
import { check, sleep } from "k6";
import { DYNAMIC_PAGE_THRESHOLDS, getBaseUrl } from "./thresholds.js";

export const options = {
  vus: 50,
  duration: "5m",
  thresholds: DYNAMIC_PAGE_THRESHOLDS,
};

const BASE_URL = getBaseUrl();

export default function () {
  let cursor = null;
  const pagesToWalk = 3 + Math.floor(Math.random() * 4); // 3–6 pages per VU

  for (let i = 0; i < pagesToWalk; i++) {
    const url = cursor
      ? `${BASE_URL}/api/feed?cursor=${encodeURIComponent(cursor)}`
      : `${BASE_URL}/api/feed`;

    const res = http.get(url, {
      tags: { route: "dynamic", endpoint: "feed" },
      headers: { accept: "application/json" },
    });
    const ok = check(res, {
      "feed responds 200": (r) => r.status === 200,
      "feed returns JSON": (r) => (r.headers["Content-Type"] ?? "").includes("json"),
    });
    if (!ok) break;

    try {
      const body = res.json();
      cursor = body?.nextCursor ?? null;
      if (!cursor) break;
    } catch {
      break;
    }
    sleep(0.3 + Math.random() * 0.7);
  }
}
