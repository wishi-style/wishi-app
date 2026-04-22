import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { ClerkSignUpPage } from "./clerk-sign-up-page";
import { E2ESignUpForm } from "./e2e-sign-up-form";

type SignUpSearchParams = { e2e?: string };

// Real users always get the Clerk sign-up. The Playwright harness opts into
// the test-only E2E form by appending `?e2e=1` to the URL — the env gate is
// still required, so the form only ever renders on envs with E2E_AUTH_MODE=true
// AND DEPLOYED_ENV !== production. Without the explicit opt-in param, the
// E2E form stays hidden even on staging (where E2E_AUTH_MODE is true for the
// /demo flow).
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<SignUpSearchParams>;
}) {
  const params = await searchParams;
  if (isE2EAuthModeEnabled() && params.e2e === "1") {
    return <E2ESignUpForm />;
  }

  return <ClerkSignUpPage />;
}
