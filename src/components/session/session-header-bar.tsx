"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

interface Props {
  stylistName: string;
  stylistAvatarUrl: string | null;
  /** Plan label rendered next to the stylist name (e.g. "Major") */
  planLabel?: string | null;
  /** Where the back chevron should route (defaults to /sessions) */
  backHref?: string;
}

/**
 * Slim header strip that sits above the StylingRoom tabs. Mirrors Loveable's
 * post-Phase-10 chat-room shell: back arrow on the left, stylist avatar +
 * name + plan tag in the middle, no menu yet (deferred — the menu items
 * Loveable shows already live in dialogs reachable from the right rail).
 */
export function SessionHeaderBar({
  stylistName,
  stylistAvatarUrl,
  planLabel,
  backHref = "/sessions",
}: Props) {
  const initials = stylistName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="border-b border-border bg-background">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link
          href={backHref}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Back to sessions"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </Link>

        <Avatar className="h-9 w-9 border border-border">
          {stylistAvatarUrl ? (
            <AvatarImage src={stylistAvatarUrl} alt={stylistName} />
          ) : null}
          <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
            {initials || stylistName.charAt(0)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0">
          <p className="font-display text-base leading-tight truncate">
            {stylistName}
          </p>
          {planLabel ? (
            <p className="text-xs text-muted-foreground uppercase tracking-widest">
              Wishi {planLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
