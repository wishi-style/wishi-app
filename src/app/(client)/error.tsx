"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[client/error]", error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl">This didn&apos;t load</h1>
      <p className="max-w-md text-muted-foreground">
        Something hiccuped loading your session area. Try again — your data is
        safe.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70">
          Reference: <span className="font-mono">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/sessions"
          className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Back to sessions
        </Link>
      </div>
    </main>
  );
}
