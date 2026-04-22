"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface BuyLooksDialogProps {
  sessionId: string;
  additionalLookDollars: number;
  maxQuantity?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BuyLooksDialog({
  sessionId,
  additionalLookDollars,
  maxQuantity = 20,
  open,
  onOpenChange,
}: BuyLooksDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();

  const total = quantity * additionalLookDollars;

  const decrement = () => setQuantity((q) => Math.max(1, q - 1));
  const increment = () => setQuantity((q) => Math.min(maxQuantity, q + 1));

  const handlePay = () => {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/buy-more-looks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity }),
        });
        const data = await res.json();
        if (!res.ok || !data.url) {
          throw new Error(data.error ?? "Could not start checkout");
        }
        window.location.href = data.url;
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-8 gap-0 text-center">
        <h2 className="font-display text-2xl mb-1">Buy More Looks</h2>
        <p className="font-body text-muted-foreground text-base mb-10">
          How many would you like?
        </p>

        <div className="flex items-center justify-center gap-8 mb-10">
          <button
            onClick={decrement}
            disabled={quantity <= 1 || isPending}
            className={cn(
              "h-16 w-16 rounded-full border border-border flex items-center justify-center transition-colors",
              quantity <= 1
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
            aria-label="Decrease quantity"
          >
            <MinusIcon className="h-5 w-5" />
          </button>

          <span className="font-display text-5xl tabular-nums w-16">
            {quantity}
          </span>

          <button
            onClick={increment}
            disabled={quantity >= maxQuantity || isPending}
            className={cn(
              "h-16 w-16 rounded-full border border-border flex items-center justify-center transition-colors",
              quantity >= maxQuantity
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:border-foreground hover:text-foreground"
            )}
            aria-label="Increase quantity"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        </div>

        <button
          onClick={handlePay}
          disabled={isPending}
          className="w-full rounded-2xl bg-foreground text-background py-4 text-lg font-body font-medium hover:bg-foreground/90 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Starting checkout…" : `Pay $${total}`}
        </button>
      </DialogContent>
    </Dialog>
  );
}
