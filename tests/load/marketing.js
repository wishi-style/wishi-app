// Marketing ramp: simulates 100 concurrent users rotating through the
// cached public pages. These are the Cache Components surfaces — any
// regression in cacheLife/cacheTag wiring lights up as p99 blown out.
//
// Usage: BASE_URL=https://staging-url npm run test:load

import http from "k6/http";
import { check, sleep } from "k6";
import {
  CACHED_PAGE_THRESHOLDS,
  DYNAMIC_PAGE_THRESHOLDS,
  getBaseUrl,
} from "./thresholds.js";

export const options = {
  stages: [
    { duration: "1m", target: 25 },   // warm up
    { duration: "1m", target: 50 },
    { duration: "10m", target: 100 }, // sustained
    { duration: "1m", target: 0 },    // ramp down
  ],
  thresholds: {
    ...CACHED_PAGE_THRESHOLDS,
    ...DYNAMIC_PAGE_THRESHOLDS,
  },
};

const BASE_URL = getBaseUrl();

const CACHED_ROUTES = [
  "/",
  "/pricing",
  "/how-it-works",
  "/lux",
  "/stylists",
];

const DYNAMIC_ROUTES = [
  "/feed",
];

function fetchRoute(path, tag) {
  const res = http.get(`${BASE_URL}${path}`, {
    tags: { route: tag, path },
    headers: { "user-agent": "wishi-load-test/1.0" },
  });
  check(res, {
    [`${path} returns 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
  return res;
}

export default function () {
  // Rotate through cached marketing pages
  for (const path of CACHED_ROUTES) {
    fetchRoute(path, "cached");
    sleep(0.5 + Math.random() * 1.0);
  }

  // Then a dynamic page
  for (const path of DYNAMIC_ROUTES) {
    fetchRoute(path, "dynamic");
    sleep(0.5 + Math.random() * 1.0);
  }
}
