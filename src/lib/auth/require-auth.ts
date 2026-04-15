import { unauthorized } from "next/navigation";
import { getServerAuth } from "./server-auth";

/**
 * Server-side guard that checks authentication only (no role check).
 * Use for routes accessible to any logged-in user regardless of role.
 */
export async function requireAuth() {
  const { userId } = await getServerAuth();

  if (!userId) {
    unauthorized();
  }

  return { userId };
}
