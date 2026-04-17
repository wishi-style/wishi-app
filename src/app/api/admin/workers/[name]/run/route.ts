import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { runWorker, WORKER_NAMES, type WorkerName } from "@/workers/entry";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/workers/[name]/run — manually kick off a background worker
 * from the admin panel. Useful for end-to-end verification without waiting
 * for EventBridge's scheduled cadence (affiliate-prompt has a 24h delay
 * before the worker would otherwise fire).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  await requireRole("ADMIN");

  const { name } = await params;
  if (!WORKER_NAMES.includes(name as WorkerName)) {
    return NextResponse.json(
      { error: `Unknown worker: ${name}`, known: WORKER_NAMES },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const result = await runWorker(name as WorkerName);
    return NextResponse.json({
      ok: true,
      worker: name,
      durationMs: Date.now() - started,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, worker: name, error: message },
      { status: 500 },
    );
  }
}
