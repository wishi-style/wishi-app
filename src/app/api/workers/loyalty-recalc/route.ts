// POST /api/workers/loyalty-recalc
// Called monthly by EventBridge Scheduler. Protected by x-worker-secret.

import { NextResponse } from "next/server";
import { runLoyaltyRecalc } from "@/workers/loyalty-recalc";
import { unauthorizedWorkerResponse, workerRequestAuthorized } from "@/lib/workers/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!workerRequestAuthorized(req)) return unauthorizedWorkerResponse();
  try {
    const result = await runLoyaltyRecalc();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[workers/loyalty-recalc] failed", err);
    return NextResponse.json({ ok: false, error: "Worker failed" }, { status: 500 });
  }
}
