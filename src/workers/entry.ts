/**
 * Worker entry point. All scheduled background work lives behind this single
 * dispatcher. EventBridge Scheduler sends a `RunTask` to a shared ECS task
 * definition with `WORKER=<name>` in containerOverrides.environment; this
 * file reads that env var and invokes the matching handler.
 *
 * When adding a new worker:
 *  1. Create `src/workers/<name>.ts` exporting `runX(): Promise<Record<string, unknown>>`
 *  2. Add its name to WORKER_NAMES
 *  3. Wire the dispatch case below
 *  4. Add an `aws_scheduler_schedule` in `infra/modules/workers/main.tf`
 *
 * Admin verification: POST /api/admin/workers/<name>/run fires runWorker()
 * directly, bypassing the container boundary.
 */
import { runAffiliateIngest } from "./affiliate-ingest";
import { runAffiliatePrompt } from "./affiliate-prompt";
import { runPendingActionExpiry } from "./pending-action-expiry";
import { runStaleCleanup } from "./stale-cleanup";

export const WORKER_NAMES = [
  "affiliate-ingest",
  "affiliate-prompt",
  "pending-action-expiry",
  "stale-cleanup",
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
  }
}

// Run as a CLI entry point when executed directly (ECS task container).
async function main() {
  const name = process.env.WORKER as WorkerName | undefined;
  if (!name || !WORKER_NAMES.includes(name)) {
    console.error(
      `[workers] WORKER env var must be one of: ${WORKER_NAMES.join(", ")}`,
    );
    process.exit(1);
  }
  const started = Date.now();
  console.log(`[workers] ${name} starting`);
  try {
    const result = await runWorker(name);
    console.log(
      `[workers] ${name} complete in ${Date.now() - started}ms`,
      result,
    );
    process.exit(0);
  } catch (err) {
    console.error(`[workers] ${name} failed:`, err);
    process.exit(1);
  }
}

// Only invoke main when this file is the entry point — the admin manual-
// trigger route imports runWorker() directly and must not spin up a second
// process.exit() loop. Using require.main === module is enough in the ECS
// container where the worker image runs this file via `node entry.js`;
// in Next.js build output this value is undefined so the import path stays
// dormant.
const isEntryPoint =
  typeof require !== "undefined" && require.main === module;
if (isEntryPoint) {
  void main();
}
