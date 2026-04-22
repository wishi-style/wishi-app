"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  stylistProfileId: string;
  initialFavorited: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function FavoriteStylistButton({
  stylistProfileId,
  initialFavorited,
  className,
  size = "md",
}: Props) {
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    const next = !favorited;
    setFavorited(next); // optimistic
    startTransition(async () => {
      try {
        const res = next
          ? await fetch("/api/favorites/stylists", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ stylistProfileId }),
            })
          : await fetch(`/api/favorites/stylists/${stylistProfileId}`, {
              method: "DELETE",
            });
        if (!res.ok) {
          setFavorited(!next); // revert
          setError("Failed to update");
        }
      } catch {
        setFavorited(!next);
        setError("Network error");
      }
    });
  };

  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-stone-200 bg-white p-2 text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60",
        favorited && "text-rose-600",
        className,
      )}
      title={error ?? undefined}
    >
      <Heart className={cn(dim, favorited && "fill-current")} />
    </button>
  );
}
