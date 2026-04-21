// Shared-secret auth for internal worker HTTP endpoints.
// EventBridge Scheduler → API destination signs requests with a header:
//   x-worker-secret: <value-from-Secrets-Manager>
// The runtime reads WORKER_SHARED_SECRET (wired from wishi/<env>/worker-secret
// in Secrets Manager via the ECS task definition).

import { timingSafeEqual } from "node:crypto";

export const WORKER_SECRET_HEADER = "x-worker-secret";

export function workerRequestAuthorized(req: Request): boolean {
  const header = req.headers.get(WORKER_SECRET_HEADER);
  const expected = process.env.WORKER_SHARED_SECRET;
  if (!expected) {
    // Fail closed — in prod we want the secret configured. In dev/test the
    // runner can opt-in by setting WORKER_SHARED_SECRET=dev in .env.
    return false;
  }
  if (!header) return false;
  // timingSafeEqual requires equal-length buffers, so do the length check
  // first (length is not secret) and then compare in constant time to avoid
  // leaking the secret via response-time side channels.
  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  if (headerBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(headerBuf, expectedBuf);
}

export function unauthorizedWorkerResponse() {
  return new Response(JSON.stringify({ error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
