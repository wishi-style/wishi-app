import { SignIn } from "@clerk/nextjs";
import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { E2ESignInForm } from "./e2e-sign-in-form";

export default function SignInPage() {
  if (isE2EAuthModeEnabled()) {
    return <E2ESignInForm />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn />
    </div>
  );
}
