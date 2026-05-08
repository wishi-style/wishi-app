import { SignUp } from "@clerk/nextjs";
import { readGuestToken } from "@/lib/auth/guest-token";
import { wishiClerkAppearance } from "@/lib/auth/clerk-appearance";

export async function ClerkSignUpPage() {
  const guestToken = await readGuestToken();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <SignUp
        appearance={wishiClerkAppearance}
        unsafeMetadata={guestToken ? { guestToken } : undefined}
      />
    </div>
  );
}
