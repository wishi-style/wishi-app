"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TrashIcon } from "lucide-react";

export function CartRemoveButton({ cartItemId }: { cartItemId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticRemoved, setOptimisticRemoved] = useState(false);

  const handleRemove = () => {
    setOptimisticRemoved(true);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/cart/${cartItemId}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to remove");
        router.refresh();
      } catch {
        setOptimisticRemoved(false);
        toast.error("Couldn't remove that item. Try again.");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={pending || optimisticRemoved}
      aria-label="Remove from bag"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
    >
      <TrashIcon className="h-3.5 w-3.5" />
      Remove
    </button>
  );
}
