"use server";

import { clearE2EAuthCookies } from "@/lib/auth/server-auth";

// Clears the e2e cookie pair so demo / E2E_AUTH_MODE users sign out cleanly.
// No-op for real Clerk users (Clerk's signOut() handles its own cookies on
// the client). Safe to call unconditionally.
export async function clearE2EOnLogout() {
  await clearE2EAuthCookies();
}
