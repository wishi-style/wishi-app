import { auth } from "@clerk/nextjs/server";
import { unauthorized } from "next/navigation";

/**
 * Server-side guard that checks authentication only (no role check).
 * Use for routes accessible to any logged-in user regardless of role.
 */
export async function requireAuth() {
  const { userId } = await auth();

  if (!userId) {
    unauthorized();
  }

  return { userId };
}
