import { SignUp } from "@clerk/nextjs";
import { readGuestToken } from "@/lib/auth/guest-token";

export async function ClerkSignUpPage() {
  const guestToken = await readGuestToken();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp unsafeMetadata={guestToken ? { guestToken } : undefined} />
    </div>
  );
}
