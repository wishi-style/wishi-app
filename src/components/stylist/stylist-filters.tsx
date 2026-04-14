"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

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
    [router, searchParams]
  );

  const styles = [
    "classic",
    "minimalist",
    "bohemian",
    "edgy",
    "streetwear",
    "romantic",
    "preppy",
    "athleisure",
  ];

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <input
        type="text"
        placeholder="Search stylists..."
        defaultValue={currentSearch}
        onChange={(e) => updateParams("q", e.target.value)}
        className="w-full rounded-full border border-stone-300 bg-white px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-black focus:outline-none sm:max-w-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => updateParams("style", "")}
          className={`rounded-full border px-4 py-2 text-xs font-medium transition-all ${
            !currentStyle
              ? "border-black bg-black text-white"
              : "border-stone-300 text-stone-600 hover:border-stone-500"
          }`}
        >
          All
        </button>
        {styles.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => updateParams("style", s)}
            className={`rounded-full border px-4 py-2 text-xs font-medium capitalize transition-all ${
              currentStyle === s
                ? "border-black bg-black text-white"
                : "border-stone-300 text-stone-600 hover:border-stone-500"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
