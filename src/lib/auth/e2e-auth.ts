export const E2E_CLERK_ID_COOKIE = "wishi_e2e_clerk_id";
export const E2E_ROLE_COOKIE = "wishi_e2e_role";
export const E2E_IS_ADMIN_COOKIE = "wishi_e2e_is_admin";

export function isE2EAuthModeEnabled() {
  if (process.env.E2E_AUTH_MODE !== "true") return false;
  if (process.env.DEPLOYED_ENV === "production") return false;
  return true;
}
