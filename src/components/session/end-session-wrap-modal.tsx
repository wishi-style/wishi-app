"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { BuyLooksDialog } from "@/components/billing/buy-looks-dialog";

interface Props {
  sessionId: string;
  additionalLookDollars: number;
}

/**
 * Client-side confirmation modal shown when the stylist has requested to end
 * the session (Session.status = PENDING_END_APPROVAL). Mirrors the in-chat
 * EndSessionCard but as a foregrounded popup so the client doesn't miss the
 * decision. Re-opens on every page load while approval is pending until the
 * client picks Add Looks / I'm Done. "Back to chat" dismisses for this view
 * only.
 *
 * Add Looks → declines the end request (so the session stays ACTIVE) and
 * opens BuyLooksDialog → Stripe Checkout. If the client cancels at Stripe the
 * decline already landed, which is the right state.
 * I'm Done    → approves the end request, then routes to /sessions/[id]/end-session
 *               (tip / rate / review flow).
 * Back to chat → soft dismiss, no state mutation.
 */
export function EndSessionWrapModal({ sessionId, additionalLookDollars }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [buyLooksOpen, setBuyLooksOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleAddLooks = () => {
    startTransition(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/end/decline`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't decline the end request");
        return;
      }
      setOpen(false);
      setBuyLooksOpen(true);
      router.refresh();
    });
  };

  const handleDone = () => {
    startTransition(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/end/approve`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't approve the end request");
        return;
      }
      router.push(`/sessions/${sessionId}/end-session`);
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-md p-8 gap-0 text-center"
        >
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Session Complete
          </p>
          <h2 className="mt-4 font-display text-3xl leading-tight">
            That&apos;s a Wrap
          </h2>
          <p className="mt-4 font-body text-sm leading-6 text-muted-foreground">
            All your looks have been delivered.
            <br />
            Your chat, boards, and pieces are yours to keep.
          </p>

          <div className="mt-7 flex items-stretch justify-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={handleAddLooks}
              className="h-12 flex-1 rounded-lg bg-foreground text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
            >
              Add Looks
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleDone}
              className="h-12 flex-1 rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              I&apos;m Done
            </button>
          </div>

          <button
            type="button"
            disabled={pending}
            onClick={() => setOpen(false)}
            className="mt-5 text-sm font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-60"
          >
            Back to chat
          </button>
        </DialogContent>
      </Dialog>

      <BuyLooksDialog
        sessionId={sessionId}
        additionalLookDollars={additionalLookDollars}
        open={buyLooksOpen}
        onOpenChange={setBuyLooksOpen}
      />
    </>
  );
}
