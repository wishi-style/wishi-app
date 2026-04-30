"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const LONG_THRESHOLD = 120;

interface Props {
  text: string;
}

/**
 * Loveable's Reviews.tsx:8-48 caps long quotes at line-clamp-4 and exposes a
 * "Read more" / "Show less" toggle below the text. Threshold of 120 chars
 * matches the source.
 */
export function ExpandableReviewText({ text }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_THRESHOLD;

  return (
    <>
      <p
        className={cn(
          "font-body text-base text-foreground leading-relaxed flex-1 italic",
          !expanded && isLong && "line-clamp-4",
        )}
      >
        &ldquo;{text}&rdquo;
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-left font-body text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </>
  );
}
