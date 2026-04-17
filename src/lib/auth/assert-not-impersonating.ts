import { forbidden } from "next/navigation";
import { getServerAuth } from "./server-auth";

/**
 * Block destructive actions while the caller is in an admin-impersonation
 * session. The `act` claim is set when an admin signs in via a Clerk actor
 * token — in that mode the admin is "acting as" another user but should not
 * be able to send payments, delete data, or post chat messages on their
 * behalf.
 */
export async function assertNotImpersonating(): Promise<void> {
  const { sessionClaims } = await getServerAuth();
  const act = (sessionClaims as { act?: { sub?: string } } | undefined)?.act;
  if (act?.sub) {
    forbidden();
  }
}
