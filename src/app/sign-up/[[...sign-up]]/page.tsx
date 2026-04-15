import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { ClerkSignUpPage } from "./clerk-sign-up-page";
import { E2ESignUpForm } from "./e2e-sign-up-form";

export default function SignUpPage() {
  if (isE2EAuthModeEnabled()) {
    return <E2ESignUpForm />;
  }

  return <ClerkSignUpPage />;
}
