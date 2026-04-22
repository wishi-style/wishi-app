import Link from "next/link";
import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";

// Renders a small signpost across the app when we're on a non-prod deploy
// that has demo mode enabled (staging). Mounted in the root layout so it
// shows on every route — testers may land anywhere. Returns null otherwise,
// so production never sees it. The env gate is the same flag that controls
// whether /demo itself is reachable — single source of truth.
export function StagingBanner() {
  if (!isE2EAuthModeEnabled()) return null;

  return (
    <div className="border-b border-amber-300/60 bg-amber-50/80 text-amber-900">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-2 px-6 py-2 text-sm">
        <span className="font-medium">Staging environment.</span>
        <span className="text-amber-900/80">
          Data resets nightly. Jump in as a demo user:
        </span>
        <Link
          href="/demo"
          className="underline underline-offset-4 hover:text-amber-950"
        >
          Go to /demo
        </Link>
      </div>
    </div>
  );
}
