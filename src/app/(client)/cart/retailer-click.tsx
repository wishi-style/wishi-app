"use client";

import * as React from "react";
import { ExternalLinkIcon } from "lucide-react";

interface Props {
  inventoryProductId?: string | null;
  retailer: string;
  url: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Retailer checkout button for the cart's "Purchase at retailer" track.
 * Fires a best-effort AffiliateClick write before redirecting — the write
 * is gated on the existing POST /api/affiliate/click semantics. When the
 * click fails for any reason we still open the retailer link so the user
 * never gets stuck behind an analytics blocker.
 */
export function RetailerClickButton({
  inventoryProductId,
  retailer,
  url,
  className,
  children,
}: Props) {
  const onClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      await fetch("/api/affiliate/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryProductId: inventoryProductId ?? undefined,
          retailer,
          url,
        }),
      });
    } catch {
      // Best-effort tracking — don't block the redirect.
    }
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={className}
    >
      {children ?? (
        <>
          <ExternalLinkIcon className="h-4 w-4" />
          Shop at {retailer}
        </>
      )}
    </a>
  );
}
