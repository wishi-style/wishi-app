"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ArrowDownCircleIcon, PauseIcon, CalendarClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "options" | "confirm";
type Action = "downgrade" | "pause" | "quarterly" | "cancel";

export interface CancelMembershipDialogProps {
  subscriptionId: string;
  miniPriceDollars: number;
  canDowngradeToMini: boolean;
  canSwitchToQuarterly: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (action: Action) => void;
}

export function CancelMembershipDialog({
  subscriptionId,
  miniPriceDollars,
  canDowngradeToMini,
  canSwitchToQuarterly,
  open,
  onOpenChange,
  onSuccess,
}: CancelMembershipDialogProps) {
  const [step, setStep] = useState<Step>("options");
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [isPending, startTransition] = useTransition();

  const retentionOptions: Array<{
    action: Action;
    icon: typeof ArrowDownCircleIcon;
    title: string;
    description: string;
    visible: boolean;
  }> = [
    {
      action: "downgrade",
      icon: ArrowDownCircleIcon,
      title: `Downgrade to Mini — $${miniPriceDollars}/mo`,
      description: "Keep your styling access at a lower price with fewer sessions.",
      visible: canDowngradeToMini,
    },
    {
      action: "pause",
      icon: PauseIcon,
      title: "Pause for 1 month",
      description: "Take a break — your preferences and history stay saved.",
      visible: true,
    },
    {
      action: "quarterly",
      icon: CalendarClockIcon,
      title: "Switch to quarterly billing",
      description: "Pay every 3 months and save on your current plan.",
      visible: canSwitchToQuarterly,
    },
  ];

  const confirmMessages: Record<Action, { title: string; description: string; cta: string }> = {
    downgrade: {
      title: "Downgrade to Mini?",
      description: `You'll switch to the Mini plan ($${miniPriceDollars}/mo) at your next billing cycle. You can upgrade again anytime.`,
      cta: "Confirm Downgrade",
    },
    pause: {
      title: "Pause for 1 month?",
      description: "Your membership will be paused until next month. You won't be charged during the pause.",
      cta: "Confirm Pause",
    },
    quarterly: {
      title: "Switch to quarterly billing?",
      description: "You'll be billed every 3 months instead of monthly, starting at your next billing cycle.",
      cta: "Confirm Switch",
    },
    cancel: {
      title: "Are you sure you want to cancel?",
      description: "You'll lose access to styling sessions and all membership benefits at the end of your current billing period.",
      cta: "Cancel Membership",
    },
  };

  const reset = () => {
    setStep("options");
    setSelectedAction(null);
  };

  const close = (val: boolean) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const handleSelect = (action: Action) => {
    setSelectedAction(action);
    setStep("confirm");
  };

  const handleConfirm = () => {
    if (!selectedAction) return;
    startTransition(async () => {
      try {
        const req =
          selectedAction === "downgrade"
            ? fetch(`/api/subscriptions/${subscriptionId}/downgrade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ planType: "MINI" }),
              })
            : selectedAction === "pause"
              ? fetch(`/api/subscriptions/${subscriptionId}/pause`, { method: "POST" })
              : selectedAction === "quarterly"
                ? fetch(`/api/subscriptions/${subscriptionId}/frequency`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ frequency: "QUARTERLY" }),
                  })
                : fetch(`/api/subscriptions/${subscriptionId}/cancel`, { method: "POST" });
        const res = await req;
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Could not update subscription");

        const successMessages: Record<Action, string> = {
          downgrade: "Downgraded to Mini plan",
          pause: "Membership paused for 1 month",
          quarterly: "Switched to quarterly billing",
          cancel: "Membership cancellation requested",
        };
        toast.success(successMessages[selectedAction]);
        onSuccess?.(selectedAction);
        close(false);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const confirm = selectedAction ? confirmMessages[selectedAction] : null;
  const visibleRetention = retentionOptions.filter((o) => o.visible);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        {step === "options" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">Before you go…</DialogTitle>
              <DialogDescription className="font-body">
                We&apos;d hate to see you leave. Would any of these work instead?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-4">
              {visibleRetention.map((opt) => (
                <button
                  key={opt.action}
                  onClick={() => handleSelect(opt.action)}
                  className="w-full flex items-start gap-3 rounded-xl border border-border p-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <opt.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-body text-sm font-semibold text-foreground">
                      {opt.title}
                    </p>
                    <p className="font-body text-xs text-muted-foreground mt-0.5">
                      {opt.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => handleSelect("cancel")}
              className="mt-4 w-full font-body text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              I still want to cancel
            </button>
          </>
        ) : confirm ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">{confirm.title}</DialogTitle>
              <DialogDescription className="font-body">
                {confirm.description}
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className={cn(
                  "flex-1 rounded-full px-5 py-2.5 text-sm font-body font-medium transition-colors disabled:opacity-60",
                  selectedAction === "cancel"
                    ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    : "bg-foreground text-background hover:bg-foreground/90"
                )}
              >
                {isPending ? "Working…" : confirm.cta}
              </button>
              <button
                onClick={reset}
                disabled={isPending}
                className="flex-1 rounded-full border border-border px-5 py-2.5 text-sm font-body hover:bg-muted transition-colors disabled:opacity-60"
              >
                Go Back
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
