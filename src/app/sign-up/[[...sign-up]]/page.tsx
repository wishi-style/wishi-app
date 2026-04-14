"use client";

import { SignUp } from "@clerk/nextjs";
import { useEffect, useState } from "react";

export default function SignUpPage() {
  const [guestToken, setGuestToken] = useState<string | undefined>();

  useEffect(() => {
    // Read the guest token cookie client-side so it can be passed to Clerk
    // via unsafeMetadata. The webhook handler reads it to claim anonymous
    // MatchQuizResult rows created during the pre-signup Match Quiz flow.
    const match = document.cookie.match(/wishi_guest_token=([^;]+)/);
    if (match) {
      setGuestToken(match[1]);
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        unsafeMetadata={guestToken ? { guestToken } : undefined}
      />
    </div>
  );
}
