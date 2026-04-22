"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const styles = [
  "classic",
  "minimalist",
  "bohemian",
  "edgy",
  "streetwear",
  "romantic",
  "preppy",
  "athleisure",
] as const;

export function StylistFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentStyle = searchParams.get("style") ?? "";
  const currentSearch = searchParams.get("q") ?? "";

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/stylists?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full sm:max-w-xs">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search stylists by name"
          defaultValue={currentSearch}
          onChange={(e) => updateParams("q", e.target.value)}
          className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateParams("style", "")}
          className={cn(
            "rounded-full border px-4 py-2 text-xs font-medium transition-colors",
            !currentStyle
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:border-foreground/50",
          )}
        >
          All
        </button>
        {styles.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => updateParams("style", s)}
            className={cn(
              "rounded-full border px-4 py-2 text-xs font-medium capitalize transition-colors",
              currentStyle === s
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/50",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
