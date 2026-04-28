import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { ClerkSignInPage } from "./clerk-sign-in-page";
import { E2ESignInForm } from "./e2e-sign-in-form";

type SignInSearchParams = { e2e?: string };

// Real users always get the Clerk sign-in. The Playwright harness opts into
// the test-only E2E form by appending `?e2e=1` to the URL — the env gate is
// still required, so the form only ever renders on envs with E2E_AUTH_MODE=true
// AND DEPLOYED_ENV !== production. Without the explicit opt-in param, the
// E2E form stays hidden even on staging (where E2E_AUTH_MODE is true for the
// /demo flow). Mirrors the sign-up route.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SignInSearchParams>;
}) {
  const params = await searchParams;
  if (isE2EAuthModeEnabled() && params.e2e === "1") {
    return <E2ESignInForm />;
  }

  return <ClerkSignInPage />;
}
