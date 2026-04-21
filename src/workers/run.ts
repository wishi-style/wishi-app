/**
 * Container entrypoint. The worker Docker image runs this file via
 * `npx tsx src/workers/run.ts`. Reads the `WORKER` env var (set per-schedule
 * by EventBridge Scheduler `containerOverrides.environment`), dispatches
 * to the matching handler in entry.ts, and exits with the result.
 *
 * Kept separate from entry.ts so importing runWorker() from the admin
 * manual-trigger route doesn't kick off this loop.
 */
import { runWorker, WORKER_NAMES, type WorkerName } from "./entry";

async function main(): Promise<void> {
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

void main();
