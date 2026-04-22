"use client";

import * as React from "react";
import Link from "next/link";
import { SparklesIcon, ShoppingBagIcon } from "lucide-react";
import { BuyLooksDialog } from "@/components/billing/buy-looks-dialog";
import type { WorkspaceProgress } from "./workspace";

interface Props {
  sessionId: string;
  progress: WorkspaceProgress;
}

/**
 * Right-rail sidebar on the StylingRoom — plan progress, Buy More Looks
 * CTA (opens BuyLooksDialog), and Upgrade Plan CTA (deep-links to
 * settings where the membership card owns the upgrade flow).
 */
export function SessionSidebar({ sessionId, progress }: Props) {
  const [buyOpen, setBuyOpen] = React.useState(false);

  const looksRemaining = Math.max(
    progress.boardCount - progress.styleboardsSent,
    0,
  );
  const donePct = Math.min(
    100,
    Math.round((progress.styleboardsSent / Math.max(progress.boardCount, 1)) * 100),
  );
  const planLabel =
    progress.planType === "LUX"
      ? "Lux"
      : progress.planType === "MAJOR"
        ? "Major"
        : "Mini";

  const additionalLookDollars = Math.round(
    progress.additionalLookPriceCents / 100,
  );

  return (
    <>
      <aside className="hidden lg:flex w-80 flex-shrink-0 flex-col border-l border-border bg-muted/20 p-5 gap-5 overflow-y-auto">
        <section className="rounded-2xl border border-border bg-background p-5">
          <p className="text-xs uppercase tracking-widest text-dark-taupe">
            {planLabel} session
          </p>
          <h3 className="font-display text-lg mt-1">Your progress</h3>

          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span>Looks sent</span>
              <span className="tabular-nums">
                {progress.styleboardsSent} / {progress.boardCount}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-foreground transition-[width]"
                style={{ width: `${donePct}%` }}
              />
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Revisions sent</dt>
              <dd className="mt-0.5 tabular-nums">{progress.revisionsSent}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Items curated</dt>
              <dd className="mt-0.5 tabular-nums">{progress.itemsSent}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-muted-foreground">
            {looksRemaining > 0
              ? `${looksRemaining} look${looksRemaining === 1 ? "" : "s"} left on this session.`
              : "You've used every look on this session."}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-background p-5">
          <div className="flex items-center gap-2">
            <ShoppingBagIcon className="h-4 w-4" />
            <h3 className="font-display text-lg">Buy more looks</h3>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Add another styleboard to this session for ${additionalLookDollars}.
          </p>
          <button
            type="button"
            onClick={() => setBuyOpen(true)}
            className="mt-3 w-full inline-flex h-9 items-center justify-center rounded-full border border-foreground px-4 text-xs hover:bg-muted transition-colors"
          >
            Add a look · ${additionalLookDollars}
          </button>
        </section>

        {progress.planType !== "LUX" ? (
          <section className="rounded-2xl border border-border bg-background p-5">
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-4 w-4" />
              <h3 className="font-display text-lg">Upgrade plan</h3>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Want more looks or the Lux one-off? Manage your membership in
              settings.
            </p>
            <Link
              href="/settings"
              className="mt-3 w-full inline-flex h-9 items-center justify-center rounded-full bg-foreground text-background px-4 text-xs hover:bg-foreground/90 transition-colors"
            >
              Manage membership
            </Link>
          </section>
        ) : null}
      </aside>

      <BuyLooksDialog
        sessionId={sessionId}
        additionalLookDollars={additionalLookDollars}
        open={buyOpen}
        onOpenChange={setBuyOpen}
      />
    </>
  );
}
