import { auth } from "@clerk/nextjs/server";
import { unauthorized, forbidden } from "next/navigation";
import type { UserRole } from "@/generated/prisma/client";

/**
 * Server-side guard that checks both authentication and role authorization.
 * Reads the user's role from Clerk publicMetadata (propagated to session JWT).
 *
 * Call from Server Components and route group layouts:
 *   const { userId, role } = await requireRole("CLIENT", "ADMIN");
 */
export async function requireRole(...allowedRoles: UserRole[]) {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    unauthorized();
  }

  const metadata = sessionClaims?.metadata as
    | { role?: UserRole }
    | undefined;
  const role = metadata?.role;

  if (!role || !allowedRoles.includes(role)) {
    forbidden();
  }

  return { userId, role };
}
