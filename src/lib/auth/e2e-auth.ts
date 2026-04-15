export const E2E_CLERK_ID_COOKIE = "wishi_e2e_clerk_id";
export const E2E_ROLE_COOKIE = "wishi_e2e_role";

export function isE2EAuthModeEnabled() {
  return process.env.E2E_AUTH_MODE === "true";
}
