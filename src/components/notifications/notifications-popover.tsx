"use client";

import { useMemo, useState } from "react";
import {
  BellIcon,
  CalendarIcon,
  MessageCircleIcon,
  CheckCircle2Icon,
  StarIcon,
  DollarSignIcon,
  CrownIcon,
  ShoppingBagIcon,
  BanknoteIcon,
  HeartIcon,
  SparklesIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/lib/notifications/use-notifications";
import { formatRelative } from "@/lib/notifications/format";
import { useRouter } from "next/navigation";
import type { NotificationCategory } from "@/generated/prisma/client";

const CATEGORY_ICON: Record<NotificationCategory, React.ComponentType<{ className?: string }>> = {
  TIP: DollarSignIcon,
  BOOKING: CalendarIcon,
  MESSAGE: MessageCircleIcon,
  SESSION: CheckCircle2Icon,
  REVIEW: StarIcon,
  PAYOUT: BanknoteIcon,
  ORDER: ShoppingBagIcon,
  SUBSCRIPTION: CrownIcon,
  STYLIST_AVAILABILITY: HeartIcon,
  AFFILIATE: SparklesIcon,
  PLATFORM: RefreshCwIcon,
};

interface Props {
  /**
   * Label for the "counterparty" tab. "Clients" for the stylist
   * surface, "Stylists" for the client surface.
   */
  counterpartyLabel: "Clients" | "Stylists";
}

export function NotificationsPopover({ counterpartyLabel }: Props) {
  const router = useRouter();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "counterparty" | "platform">("all");

  const filtered = useMemo(() => {
    if (tab === "counterparty") return items.filter((n) => n.source === "CLIENT");
    if (tab === "platform") return items.filter((n) => n.source === "PLATFORM");
    return items;
  }, [items, tab]);

  const handleClick = (id: string, href: string | null) => {
    void markRead(id);
    setOpen(false);
    if (href) router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-full p-2 hover:bg-muted transition-colors"
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        >
          <BellIcon className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-burgundy px-1 text-[10px] font-medium text-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <div className="font-medium">Notifications</div>
            <div className="text-xs text-muted-foreground">{unreadCount} unread</div>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Mark all read
          </button>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="counterparty">{counterpartyLabel}</TabsTrigger>
            <TabsTrigger value="platform">Platform</TabsTrigger>
          </TabsList>
          <ScrollArea className="h-[420px]">
            <ul>
              {filtered.length === 0 && (
                <li className="px-4 py-12 text-center text-sm text-muted-foreground">
                  Nothing here yet
                </li>
              )}
              {filtered.map((n) => {
                const Icon = CATEGORY_ICON[n.category] ?? RefreshCwIcon;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      !n.readAt && "bg-warm-beige/30",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleClick(n.id, n.href)}
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                    >
                      <Icon className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{n.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {n.body}
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {formatRelative(new Date(n.createdAt))}
                        </div>
                      </div>
                      {!n.readAt && (
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-burgundy" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
