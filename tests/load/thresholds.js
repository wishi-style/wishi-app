// Phase 11 launch targets. Imported by every scenario so the numbers stay
// centralized. Update here; every script picks up the new threshold.

export const CACHED_PAGE_THRESHOLDS = {
  // 0.5% error rate budget — marketing pages are cached, should barely fail
  http_req_failed: ["rate<0.005"],
  "http_req_duration{route:cached}": ["p(95)<500", "p(99)<1000"],
};

export const DYNAMIC_PAGE_THRESHOLDS = {
  http_req_failed: ["rate<0.01"],
  "http_req_duration{route:dynamic}": ["p(95)<1500", "p(99)<3000"],
};

export const DEFAULT_BASE_URL = "http://localhost:3000";

export function getBaseUrl() {
  return (__ENV.BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}
