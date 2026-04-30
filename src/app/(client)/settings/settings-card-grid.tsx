"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CrownIcon,
  ExternalLinkIcon,
  GiftIcon,
  HeartIcon,
  LockIcon,
  PaletteIcon,
  ReceiptIcon,
  ShirtIcon,
  ShoppingBagIcon,
  CreditCardIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BaseCard {
  key: string;
  title: string;
  description: string;
  iconKey: keyof typeof iconMap;
  accent: string;
}

interface ExpandCard extends BaseCard {
  kind: "expand";
}

interface LinkCard extends BaseCard {
  kind: "link";
  href: string;
}

interface PortalCard extends BaseCard {
  kind: "portal";
}

export type SettingsCard = ExpandCard | LinkCard | PortalCard;

const iconMap = {
  user: UserIcon,
  crown: CrownIcon,
  gift: GiftIcon,
  card: CreditCardIcon,
  bag: ShoppingBagIcon,
  shirt: ShirtIcon,
  heart: HeartIcon,
  palette: PaletteIcon,
  lock: LockIcon,
  receipt: ReceiptIcon,
} satisfies Record<string, LucideIcon>;

interface Props {
  cards: SettingsCard[];
  panels: Record<string, ReactNode>;
}

export function SettingsCardGrid({ cards, panels }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const openPortal = async () => {
    if (portalLoading) return;
    setPortalError(null);
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal-session", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setPortalError(data.error ?? "Could not open billing portal");
        return;
      }
      window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card) => {
          const Icon = iconMap[card.iconKey];
          const isExpanded = card.kind === "expand" && expanded === card.key;
          const wrapperClass = cn(
            "group bg-card rounded-2xl border border-border transition-all duration-200",
            isExpanded
              ? "sm:col-span-2 lg:col-span-3 shadow-md ring-1 ring-secondary/50"
              : "hover:shadow-md hover:-translate-y-0.5 hover:border-secondary/60",
          );

          const inner = (
            <div className="p-6 cursor-pointer min-h-[150px] flex flex-col">
              <div
                className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center mb-4",
                  card.accent,
                )}
              >
                <Icon className="h-5 w-5 text-secondary-foreground" />
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <h3 className="font-display text-lg text-foreground">{card.title}</h3>
                {card.kind === "expand" ? (
                  isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  )
                ) : card.kind === "portal" ? (
                  <ExternalLinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {card.description}
              </p>
              {card.kind === "portal" && portalError && expanded === null ? (
                <p className="mt-2 text-xs text-burgundy">{portalError}</p>
              ) : null}
            </div>
          );

          if (card.kind === "link") {
            return (
              <div key={card.key} className={wrapperClass}>
                <Link href={card.href} className="block">
                  {inner}
                </Link>
              </div>
            );
          }

          if (card.kind === "portal") {
            return (
              <div key={card.key} className={wrapperClass}>
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="block w-full text-left disabled:opacity-60"
                >
                  {inner}
                </button>
              </div>
            );
          }

          return (
            <div key={card.key} className={wrapperClass}>
              <button
                type="button"
                onClick={() =>
                  setExpanded((prev) => (prev === card.key ? null : card.key))
                }
                className="block w-full text-left"
                aria-expanded={isExpanded}
              >
                {inner}
              </button>
              {isExpanded ? (
                <div className="px-6 pb-6 border-t border-border pt-5">
                  {panels[card.key] ?? null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
