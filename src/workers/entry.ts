/**
 * Worker dispatcher. All scheduled background work lives behind `runWorker`.
 * EventBridge Scheduler sends a `RunTask` to a shared ECS task definition
 * with `WORKER=<name>` in containerOverrides.environment; `run.ts` reads
 * that env var and calls runWorker().
 *
 * This file has NO side effects on import so the admin manual-trigger route
 * can import `runWorker` safely. The process.exit() CLI loop lives in
 * `run.ts`, which is the container's CMD.
 *
 * When adding a new worker:
 *  1. Create `src/workers/<name>.ts` exporting `runX(): Promise<Record<string, unknown>>`
 *  2. Add its name to WORKER_NAMES
 *  3. Wire the dispatch case below
 *  4. Add an `aws_scheduler_schedule` in `infra/modules/workers/main.tf`
 */
import { runAffiliateIngest } from "./affiliate-ingest";
import { runAffiliatePrompt } from "./affiliate-prompt";
import { runPendingActionExpiry } from "./pending-action-expiry";
import { runStaleCleanup } from "./stale-cleanup";
import { runDemoReset } from "./demo-reset";

export const WORKER_NAMES = [
  "affiliate-ingest",
  "affiliate-prompt",
  "pending-action-expiry",
  "stale-cleanup",
  "demo-reset",
] as const;

export type WorkerName = (typeof WORKER_NAMES)[number];

export async function runWorker(name: WorkerName): Promise<Record<string, unknown>> {
  switch (name) {
    case "affiliate-ingest":
      return runAffiliateIngest();
    case "affiliate-prompt":
      return runAffiliatePrompt();
    case "pending-action-expiry":
      return runPendingActionExpiry();
    case "stale-cleanup":
      return runStaleCleanup();
    case "demo-reset":
      return runDemoReset();
  }
}
