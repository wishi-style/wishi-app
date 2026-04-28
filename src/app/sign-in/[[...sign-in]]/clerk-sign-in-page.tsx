import { SignIn } from "@clerk/nextjs";

export function ClerkSignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn />
    </div>
  );
}
