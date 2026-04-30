"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellIcon,
  CalendarIcon,
  MessageCircleIcon,
  ShoppingBagIcon,
  CrownIcon,
  RefreshCwIcon,
  PlayCircleIcon,
  StopCircleIcon,
  StarIcon,
  HeartIcon,
  SparklesIcon,
  DollarSignIcon,
  CheckCircle2Icon,
  BanknoteIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AppNotification,
  NotificationType,
  formatRelative,
  mockNotifications,
} from "@/data/notifications";

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  booking: CalendarIcon,
  subscription_started: PlayCircleIcon,
  subscription_reactivated: RefreshCwIcon,
  message: MessageCircleIcon,
  looks_purchased: ShoppingBagIcon,
  plan_upgraded: CrownIcon,
  session_ended: StopCircleIcon,
  review: StarIcon,
  tip: DollarSignIcon,
  favorite_profile: HeartIcon,
  favorite_look: SparklesIcon,
  session_eligible_to_end: CheckCircle2Icon,
  payout: BanknoteIcon,
};

export function NotificationsPopover() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>(mockNotifications);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("all");

  const unread = items.filter((n) => !n.read).length;

  const filtered = useMemo(() => {
    if (tab === "clients") return items.filter((n) => n.source === "client");
    if (tab === "platform") return items.filter((n) => n.source === "platform");
    return items;
  }, [items, tab]);

  const markAllRead = () =>
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));

  const handleClick = (n: AppNotification) => {
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setOpen(false);
    router.push(n.href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative rounded-full p-2 hover:bg-muted transition-colors"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <BellIcon className="h-5 w-5 text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-body">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] p-0 font-body"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="font-display text-base font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              {unread > 0 ? `${unread} unread` : "You're all caught up"}
            </p>
          </div>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid grid-cols-3 mx-3 mt-3">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            <TabsTrigger value="clients" className="text-xs">Clients</TabsTrigger>
            <TabsTrigger value="platform" className="text-xs">Platform</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-2">
            <ScrollArea className="h-[420px]">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No notifications here yet.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((n) => {
                    const Icon = ICONS[n.type];
                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => handleClick(n)}
                          className={cn(
                            "w-full text-left px-4 py-3 flex gap-3 hover:bg-muted/60 transition-colors",
                            !n.read && "bg-accent/10"
                          )}
                        >
                          <div
                            className={cn(
                              "h-9 w-9 shrink-0 rounded-full flex items-center justify-center",
                              n.source === "platform"
                                ? "bg-primary/10 text-primary"
                                : "bg-accent/20 text-accent-foreground"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium leading-snug truncate">
                                {n.title}
                              </p>
                              {!n.read && (
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {n.body}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-muted-foreground">
                                {formatRelative(n.createdAt)}
                              </span>
                              {n.plan && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] px-1.5 py-0 h-4"
                                >
                                  {n.plan}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
