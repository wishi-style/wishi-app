"use client";

import { SignUp } from "@clerk/nextjs";
import { useSyncExternalStore } from "react";

function getGuestToken() {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(/wishi_guest_token=([^;]+)/);
  return match ? match[1] : undefined;
}

function subscribe() {
  // Cookie doesn't change during the sign-up flow, no-op subscriber
  return () => {};
}

export default function SignUpPage() {
  const guestToken = useSyncExternalStore(subscribe, getGuestToken, () => undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        unsafeMetadata={guestToken ? { guestToken } : undefined}
      />
    </div>
  );
}
