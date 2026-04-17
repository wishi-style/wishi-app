// POST /api/workers/payout-reconcile
// Called by EventBridge Scheduler weekly (Mondays 06:00 UTC).
// Protected by x-worker-secret header.

import { NextResponse } from "next/server";
import { runPayoutReconcile } from "@/workers/payout-reconcile";
import { unauthorizedWorkerResponse, workerRequestAuthorized } from "@/lib/workers/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!workerRequestAuthorized(req)) return unauthorizedWorkerResponse();
  try {
    const result = await runPayoutReconcile();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[workers/payout-reconcile] failed", err);
    return NextResponse.json({ ok: false, error: "Worker failed" }, { status: 500 });
  }
}
