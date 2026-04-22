"use client";

import type { ReactNode } from "react";
import { ExternalLinkIcon } from "lucide-react";

interface Props {
  inventoryProductId?: string | null;
  retailer: string;
  url: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Retailer button for the cart's "Purchase at retailer" track.
 *
 * Uses `navigator.sendBeacon` so the AffiliateClick write survives the
 * concurrent navigation — a plain `fetch(...).then(open)` dance would
 * either (a) let popup blockers eat the window.open since it's no longer
 * in a direct user-gesture context, or (b) lose the request when the
 * browser tears down the page. sendBeacon is queued by the browser
 * exactly for this "fire-and-forget before unload" case.
 *
 * The underlying `<a target="_blank" rel="noopener noreferrer">` still
 * carries the hard URL so the link works without JS and without any
 * tracking if beacon is blocked. Worst case we lose the click write; the
 * user never loses the navigation.
 */
export function RetailerClickButton({
  inventoryProductId,
  retailer,
  url,
  className,
  children,
}: Props) {
  const onClick = () => {
    if (typeof navigator === "undefined") return;
    const body = JSON.stringify({
      inventoryProductId: inventoryProductId ?? undefined,
      retailer,
      url,
    });
    try {
      if (typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        navigator.sendBeacon("/api/affiliate/click", blob);
      } else {
        // Best-effort fallback — keepalive lets the request outlive nav.
        void fetch("/api/affiliate/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        });
      }
    } catch {
      // Click tracking is strictly best-effort.
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
