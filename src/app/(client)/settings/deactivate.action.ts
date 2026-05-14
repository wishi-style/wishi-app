"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getServerAuth } from "@/lib/auth/server-auth";
import { writeAudit } from "@/lib/audit/log";

export type DeactivateResult =
  | { ok: true; alreadyDeactivated?: true }
  | { ok: false; reason: "unauthorized" | "not_found" };

// Soft-deletes the signed-in user. Two reasons soft delete + Clerk teardown
// happen in this order:
//   1. The partial unique index on users(email) WHERE deleted_at IS NULL
//      frees the email for re-registration the moment deletedAt is set.
//   2. Deleting the Clerk identity invalidates the session, so the next
//      request from this browser is treated as a guest.
// If Clerk's deleteUser fails we don't roll back — soft delete is the
// authoritative side and Matt can clean stragglers in Clerk by hand.
export async function deactivateAccount(): Promise<DeactivateResult> {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) return { ok: false, reason: "unauthorized" };

  const user = await prisma.user.findUnique({ where: { clerkId } });
  if (!user) return { ok: false, reason: "not_found" };
  if (user.deletedAt) return { ok: true, alreadyDeactivated: true };

  await prisma.user.update({
    where: { id: user.id },
    data: { deletedAt: new Date() },
  });

  await writeAudit({
    actorUserId: user.id,
    action: "user.deactivate",
    entityType: "User",
    entityId: user.id,
    meta: { email: user.email },
  });

  if (user.clerkId) {
    try {
      const client = await clerkClient();
      await client.users.deleteUser(user.clerkId);
    } catch {
      // Intentionally swallowed — soft delete is the source of truth.
    }
  }

  return { ok: true };
}
