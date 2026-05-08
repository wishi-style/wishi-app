"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";

interface Props {
  inventoryProductId: string;
  sessionId: string;
}

export function AddToCartButton({ inventoryProductId, sessionId }: Props) {
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inventoryProductId,
            sessionId,
            quantity: 1,
          }),
        });
        if (res.ok) {
          setAdded(true);
          router.refresh();
          return;
        }
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error ?? "Could not add to cart");
      } catch {
        setError("Could not add to cart");
      }
    });
  };

  if (added) {
    return (
      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground/10 py-2.5 text-sm font-medium text-foreground">
        <CheckIcon className="h-4 w-4" />
        Added to cart
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className="inline-flex w-full items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add to Cart"}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
