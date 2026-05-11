import { SignIn } from "@clerk/nextjs";
import { wishiClerkAppearance } from "@/lib/auth/clerk-appearance";

export function ClerkSignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <SignIn appearance={wishiClerkAppearance} />
    </div>
  );
}
