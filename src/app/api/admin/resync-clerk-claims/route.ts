import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncClerkClaimsForUser } from "@/lib/auth/reconcile-clerk-user";
import {
  workerRequestAuthorized,
  unauthorizedWorkerResponse,
} from "@/lib/workers/auth";

export const dynamic = "force-dynamic";

// One-shot migration to re-sync DB → Clerk publicMetadata after the
// 20260429170000_admin_flag migration. The migration normalised DB rows
// (role=ADMIN → role=CLIENT + is_admin=true) but did not push the new
// shape into Clerk, leaving every pre-migration user with stale claims:
// the legacy `role:"ADMIN"` value (which no longer parses) and a missing
// `isAdmin` key (which trips needsReconcile on every authed request).
//
// Worker-secret auth is intentional here — `requireAdmin()` would
// be self-blocking, since the admins we're fixing are exactly the
// users whose Clerk claims are broken.
//
// Usage:
//   curl -X POST -H "x-worker-secret: $SECRET" \
//     "https://<host>/api/admin/resync-clerk-claims?dryRun=1"
//   curl -X POST -H "x-worker-secret: $SECRET" \
//     "https://<host>/api/admin/resync-clerk-claims"
export async function POST(req: Request) {
  if (!workerRequestAuthorized(req)) return unauthorizedWorkerResponse();

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  const users = await prisma.user.findMany({
    where: {
      clerkId: { startsWith: "user_" },
      deletedAt: null,
    },
    select: { id: true, clerkId: true, email: true, role: true, isAdmin: true },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{
    email: string;
    role: string;
    isAdmin: boolean;
    status: "synced" | "skipped" | "error";
    error?: string;
  }> = [];

  for (const u of users) {
    if (dryRun) {
      results.push({
        email: u.email,
        role: u.role,
        isAdmin: u.isAdmin,
        status: "skipped",
      });
      continue;
    }
    try {
      await syncClerkClaimsForUser(u.id);
      results.push({
        email: u.email,
        role: u.role,
        isAdmin: u.isAdmin,
        status: "synced",
      });
    } catch (err) {
      results.push({
        email: u.email,
        role: u.role,
        isAdmin: u.isAdmin,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    dryRun,
    total: users.length,
    synced: results.filter((r) => r.status === "synced").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  return NextResponse.json({ ...summary, results });
}
