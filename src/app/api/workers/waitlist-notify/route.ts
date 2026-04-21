// POST /api/workers/waitlist-notify
// Called by EventBridge Scheduler. Protected by x-worker-secret header.

import { NextResponse } from "next/server";
import { runWaitlistNotify } from "@/workers/waitlist-notify";
import { unauthorizedWorkerResponse, workerRequestAuthorized } from "@/lib/workers/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!workerRequestAuthorized(req)) return unauthorizedWorkerResponse();
  try {
    const result = await runWaitlistNotify();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[workers/waitlist-notify] failed", err);
    return NextResponse.json({ ok: false, error: "Worker failed" }, { status: 500 });
  }
}
