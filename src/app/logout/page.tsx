"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { clearE2EOnLogout } from "./actions";

// Logout entry point linked from the StylistTopBar avatar dropdown
// (`/logout`). Clears both auth tracks (Clerk session for real users, e2e
// cookies for demo / E2E_AUTH_MODE) and returns to the Wishi homepage.
export default function LogoutPage() {
  const { signOut } = useClerk();
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      // Clear e2e cookies first so a stale demo session doesn't bounce the
      // user back through the proxy auth gate.
      await clearE2EOnLogout();
      // Clerk's signOut accepts a redirectUrl — homepage per founder spec.
      // No-op for users who weren't authed via Clerk; resolves immediately.
      await signOut({ redirectUrl: "/" });
      // Defensive fallback if Clerk's redirect doesn't fire (e.g. e2e-only
      // user that never had a Clerk session).
      router.replace("/");
    })();
  }, [signOut, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <p className="font-body text-sm text-muted-foreground">Signing you out…</p>
    </div>
  );
}
