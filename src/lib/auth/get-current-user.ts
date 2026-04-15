import { getCurrentAuthUser } from "./server-auth";

/**
 * Resolves the current Clerk session to the Prisma User record.
 * Returns null if not authenticated or if the user hasn't been synced yet.
 */
export async function getCurrentUser() {
  return getCurrentAuthUser();
}
