"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function StylistProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[stylists/[id]/error]", error);
  }, [error]);

  return (
    <main className="container mx-auto flex min-h-[60vh] max-w-5xl flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <h1 className="font-display text-3xl">
        We couldn&apos;t load this stylist
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Give it another try — or browse our other stylists in the meantime.
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
          Retry
        </button>
        <Link
          href="/stylists"
          className="rounded-full border border-border px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Browse stylists
        </Link>
      </div>
    </main>
  );
}
