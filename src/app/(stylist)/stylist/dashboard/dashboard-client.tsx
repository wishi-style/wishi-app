"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Send,
  Mic,
  AlertTriangle,
  Clock,
  MessageCircle,
  Sparkles,
  ChevronDown,
  ArrowLeft,
  Bell,
  Calendar,
  Settings,
  SlidersHorizontal,
  ShoppingBag,
  X,
  Image,
  FileText,
  Trash2 as TrashIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import ClientDetailPanel from "@/components/stylist/client-detail-panel";


/* ─── Types ─── */
type SessionPriority = "overdue" | "due_today" | "active" | "new" | "completed";
type SessionType = "mini" | "major" | "lux";

type LoyaltyTier = "new" | "bronze" | "silver" | "gold" | "vip";

interface MockSession {
  id: string;
  clientId: string;
  clientName: string;
  clientInitials: string;
  sessionType: SessionType;
  priority: SessionPriority;
  dueLabel: string;
  lastMessage: string;
  lastMessageDate: string;
  boardsDelivered: number;
  boardsTotal: number;
  status: string;
  actionLabel: string;
  loyaltyTier: LoyaltyTier;
  totalSessions: number;
}

interface ChatMessage {
  id: string;
  sender: "stylist" | "client";
  text: string;
  timestamp: Date;
  type?: "text" | "item_recommendation";
  itemData?: { name: string; brand: string; price: string; imageUrl?: string; note?: string };
}

interface MoodBoardDraft {
  id: string;
  sessionId: string | null;
  clientName: string;
  images: string[];
  photoCount: number;
  updatedAt: string;
}

/* ─── Priority helpers ─── */
const priorityOrder: Record<SessionPriority, number> = {
  overdue: 0,
  due_today: 1,
  new: 2,
  active: 3,
  completed: 4,
};

const priorityConfig: Record<SessionPriority, { icon: React.ElementType; className: string }> = {
  overdue: { icon: AlertTriangle, className: "text-destructive" },
  due_today: { icon: Clock, className: "text-amber-600" },
  active: { icon: MessageCircle, className: "text-accent" },
  new: { icon: Sparkles, className: "text-foreground" },
  completed: { icon: Clock, className: "text-muted-foreground" },
};

const sessionTypeBadge: Record<SessionType, { label: string; className: string }> = {
  lux: { label: "Lux", className: "bg-warm-beige text-dark-taupe border-0" },
  major: { label: "Major", className: "bg-secondary text-secondary-foreground border-0" },
  mini: { label: "Mini", className: "bg-secondary text-secondary-foreground border-0" },
};

/* ─── Helpers ─── */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
}

function formatDateSep(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function shouldShowDate(msgs: ChatMessage[], i: number): boolean {
  if (i === 0) return true;
  return msgs[i - 1].timestamp.toDateString() !== msgs[i].timestamp.toDateString();
}

/* ─── Stat filter type ─── */
type StatFilter = "overdue" | "due_today" | "important" | "new" | "active" | "all";

/* ─── Component ─── */
export default function StylistDashboard({
  sessions: mockSessions,
  stylistInitials,
}: {
  sessions: MockSession[];
  stylistInitials: string;
}) {
  // Pre-select first session so the right pane isn't empty on desktop. Use
  // a lazy initializer that reads the sessions array directly (no `window`
  // branch — that caused SSR/client divergence and hydration mismatches).
  const [selectedId, setSelectedId] = useState<string | null>(
    () => mockSessions[0]?.id ?? null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<StatFilter | null>(null);
  const [sessionTypeFilter, setSessionTypeFilter] = useState<SessionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pendingActionFilter, setPendingActionFilter] = useState<string>("all");
  const [planModelFilter, setPlanModelFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"priority" | "name" | "date">("priority");
  const [filterOpen, setFilterOpen] = useState(false);
  const [itemRecOpen, setItemRecOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", brand: "", price: "", note: "", url: "" });
  const [itemSending, setItemSending] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  // Messages are fetched per-session from /api/sessions/[id]/messages on
  // first session selection. Empty until then; never seeded with mock data.
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [messagesLoading, setMessagesLoading] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [drafts, setDrafts] = useState<MoodBoardDraft[]>([]);
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  const selected = mockSessions.find((s) => s.id === selectedId) ?? null;

  // Stats
  const overdueCount = mockSessions.filter((s) => s.priority === "overdue").length;
  const dueTodayCount = mockSessions.filter((s) => s.priority === "due_today").length;
  const newCount = mockSessions.filter((s) => s.priority === "new").length;
  const activeCount = mockSessions.filter((s) => s.priority === "active").length;
  const allCount = mockSessions.length;

  const stats: { key: StatFilter; count: number; label: string }[] = [
    { key: "overdue", count: overdueCount, label: "Overdue" },
    { key: "due_today", count: dueTodayCount, label: "Due Today" },
    { key: "important", count: 0, label: "Important" },
    { key: "new", count: newCount, label: "New Bookings" },
    { key: "active", count: activeCount, label: "Active" },
    { key: "all", count: allCount, label: "All" },
  ];

  // Filtering & sorting
  const hasActiveFilters = sessionTypeFilter !== "all" || statusFilter !== "all" || pendingActionFilter !== "all" || planModelFilter !== "all" || sortBy !== "priority";

  const resetFilters = () => {
    setSessionTypeFilter("all");
    setStatusFilter("all");
    setPendingActionFilter("all");
    setPlanModelFilter("all");
    setSortBy("priority");
  };

  const filtered = mockSessions
    .filter((s) => {
      const matchesSearch = !searchQuery || s.clientName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = !activeFilter || activeFilter === "all" || s.priority === activeFilter;
      const matchesType = sessionTypeFilter === "all" || s.sessionType === sessionTypeFilter;
      const matchesStatus = statusFilter === "all" || s.priority === statusFilter;
      const matchesPending = pendingActionFilter === "all" ||
        (pendingActionFilter === "needs_board" && s.boardsDelivered < s.boardsTotal) ||
        (pendingActionFilter === "awaiting_feedback" && s.boardsDelivered > 0);
      const matchesPlanModel = planModelFilter === "all" ||
        (planModelFilter === "one_time" ? true : false); // mock: all are one-time for now
      return matchesSearch && matchesPriority && matchesType && matchesStatus && matchesPending && matchesPlanModel;
    })
    .sort((a, b) => {
      if (sortBy === "priority") return priorityOrder[a.priority] - priorityOrder[b.priority];
      if (sortBy === "name") return a.clientName.localeCompare(b.clientName);
      return b.lastMessageDate.localeCompare(a.lastMessageDate);
    });

  // Hydrate drafts from the server. /api/moodboards?status=draft returns
  // every unsent moodboard the authed stylist owns, scoped to their account
  // so drafts roam across devices instead of being trapped in one browser.
  const reloadDrafts = useCallback(async () => {
    try {
      const res = await fetch("/api/moodboards?status=draft", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { drafts: MoodBoardDraft[] };
      setDrafts(data.drafts ?? []);
    } catch {
      /* keep prior list on transient failure */
    }
  }, []);

  useEffect(() => {
    void reloadDrafts();
  }, [reloadDrafts]);

  // Scroll chat on selection or new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedId, messages]);

  // Fetch real Twilio-mirrored messages from the DB when a session is
  // selected. Only fires once per session per page-load to avoid pounding
  // the API as the stylist hops rows; /workspace is the real-time surface.
  useEffect(() => {
    if (!selectedId) return;
    if (messagesLoading[selectedId]) return;
    const sid = selectedId;
    setMessagesLoading((prev) => ({ ...prev, [sid]: true }));
    void (async () => {
      try {
        const res = await fetch(`/api/sessions/${sid}/messages?limit=50`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          messages: Array<{
            id: string;
            text: string | null;
            sender: "stylist" | "client" | "system";
            createdAt: string;
          }>;
        };
        const mapped: ChatMessage[] = data.messages
          .filter((m) => m.sender !== "system")
          .map((m) => ({
            id: m.id,
            sender: m.sender === "stylist" ? "stylist" : "client",
            text: m.text ?? "",
            timestamp: new Date(m.createdAt),
          }));
        setMessages((prev) => ({ ...prev, [sid]: mapped }));
      } catch {
        /* keep mock data on failure — Dashboard is preview-only */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedId || sending) return;
    const text = inputValue.trim();
    const optimistic: ChatMessage = {
      id: `pending-${Date.now()}`,
      sender: "stylist",
      text,
      timestamp: new Date(),
    };
    setMessages((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] || []), optimistic],
    }));
    setInputValue("");
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${selectedId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        // Roll back the optimistic send so the stylist doesn't think it shipped.
        setMessages((prev) => ({
          ...prev,
          [selectedId]:
            (prev[selectedId] ?? []).filter((m) => m.id !== optimistic.id),
        }));
        setInputValue(text);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendItem = async () => {
    if (itemSending) return;
    if (!itemForm.name.trim() || !itemForm.url.trim() || !selectedId) return;
    try {
      new URL(itemForm.url.trim());
    } catch {
      setItemError("Enter a valid product URL");
      return;
    }
    const sessionIdAtSend = selectedId;
    const summaryLines = [
      `Recommended: ${itemForm.name.trim()}`,
      itemForm.brand.trim(),
      itemForm.price.trim(),
      itemForm.note.trim() ? `"${itemForm.note.trim()}"` : "",
    ].filter(Boolean);
    const summary = summaryLines.join("\n");
    const optimistic: ChatMessage = {
      id: `pending-item-${Date.now()}`,
      sender: "stylist",
      text: summary,
      timestamp: new Date(),
      type: "item_recommendation",
      itemData: {
        name: itemForm.name.trim(),
        brand: itemForm.brand.trim(),
        price: itemForm.price.trim(),
        note: itemForm.note.trim(),
      },
    };
    setItemError(null);
    setItemSending(true);
    setMessages((prev) => ({
      ...prev,
      [sessionIdAtSend]: [...(prev[sessionIdAtSend] || []), optimistic],
    }));
    try {
      const res = await fetch(`/api/sessions/${sessionIdAtSend}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "SINGLE_ITEM",
          webUrl: itemForm.url.trim(),
          body: summary,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setItemError(data.error ?? "Could not send recommendation");
        setMessages((prev) => ({
          ...prev,
          [sessionIdAtSend]:
            (prev[sessionIdAtSend] ?? []).filter((m) => m.id !== optimistic.id),
        }));
        return;
      }
      setItemForm({ name: "", brand: "", price: "", note: "", url: "" });
      setItemRecOpen(false);
    } catch (err) {
      setItemError(err instanceof Error ? err.message : "Network error");
      setMessages((prev) => ({
        ...prev,
        [sessionIdAtSend]:
          (prev[sessionIdAtSend] ?? []).filter((m) => m.id !== optimistic.id),
      }));
    } finally {
      setItemSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const currentMessages = selectedId ? messages[selectedId] || [] : [];

  /* ─── Left Panel ─── */
  const leftPanel = (
    <div className={cn(
      "flex flex-col border-r border-border bg-background",
      isMobile ? "w-full" : "w-[380px] shrink-0"
    )}>
      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search client by name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 font-body text-sm rounded-sm bg-background"
          />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 p-4 border-b border-border">
        {stats.map((stat) => (
          <button
            key={stat.key}
            onClick={() => setActiveFilter(activeFilter === stat.key ? null : stat.key)}
            className={cn(
              "flex flex-col items-center justify-center rounded-sm border py-2.5 px-2 transition-colors",
              activeFilter === stat.key
                ? "border-foreground bg-foreground/5"
                : "border-border hover:border-foreground/30"
            )}
          >
            <span className="font-display text-xl leading-none">{stat.count}</span>
            <span className="font-body text-[10px] text-muted-foreground mt-1">{stat.label}</span>
          </button>
        ))}
      </div>

      {/* Filter & Sort Row */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
        <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 rounded-sm font-body text-xs border-border relative"
              />
            }
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filter & Sort
            {hasActiveFilters && (
              <span className="h-2 w-2 rounded-full bg-accent absolute -top-0.5 -right-0.5" />
            )}
          </SheetTrigger>
          <SheetContent side="left" className="w-[320px] sm:w-[360px] p-0">
            <SheetHeader className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <SheetTitle className="font-display text-lg">Filter & Sort</SheetTitle>
                <button
                  onClick={resetFilters}
                  className="font-body text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Reset
                </button>
              </div>
            </SheetHeader>

            <ScrollArea className="h-[calc(100vh-8rem)]">
              <Accordion multiple className="px-6">
                {/* Pending Action */}
                <AccordionItem value="pending-action">
                  <AccordionTrigger className="font-body text-sm font-medium py-4">
                    Pending Action
                  </AccordionTrigger>
                  <AccordionContent>
                    <RadioGroup value={pendingActionFilter} onValueChange={setPendingActionFilter} className="space-y-2 pb-2">
                      {[
                        { value: "all", label: "All" },
                        { value: "needs_board", label: "Needs board" },
                        { value: "awaiting_feedback", label: "Awaiting feedback" },
                      ].map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <RadioGroupItem value={opt.value} id={`pa-${opt.value}`} />
                          <Label htmlFor={`pa-${opt.value}`} className="font-body text-sm font-normal cursor-pointer">{opt.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </AccordionContent>
                </AccordionItem>

                {/* Client (search) */}
                <AccordionItem value="client">
                  <AccordionTrigger className="font-body text-sm font-medium py-4">
                    Client
                  </AccordionTrigger>
                  <AccordionContent>
                    <Input
                      placeholder="Search by name"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-9 font-body text-sm mb-2"
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Status */}
                <AccordionItem value="status">
                  <AccordionTrigger className="font-body text-sm font-medium py-4">
                    Status
                  </AccordionTrigger>
                  <AccordionContent>
                    <RadioGroup value={statusFilter} onValueChange={setStatusFilter} className="space-y-2 pb-2">
                      {[
                        { value: "all", label: "All" },
                        { value: "overdue", label: "Overdue" },
                        { value: "due_today", label: "Due today" },
                        { value: "active", label: "Active" },
                        { value: "new", label: "New" },
                        { value: "completed", label: "Completed" },
                      ].map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <RadioGroupItem value={opt.value} id={`st-${opt.value}`} />
                          <Label htmlFor={`st-${opt.value}`} className="font-body text-sm font-normal cursor-pointer">{opt.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </AccordionContent>
                </AccordionItem>

                {/* Plan Type */}
                <AccordionItem value="plan-type">
                  <AccordionTrigger className="font-body text-sm font-medium py-4">
                    Plan Type
                  </AccordionTrigger>
                  <AccordionContent>
                    <RadioGroup value={sessionTypeFilter} onValueChange={(v) => setSessionTypeFilter(v as SessionType | "all")} className="space-y-2 pb-2">
                      {[
                        { value: "all", label: "All" },
                        { value: "lux", label: "Lux" },
                        { value: "major", label: "Major" },
                        { value: "mini", label: "Mini" },
                      ].map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <RadioGroupItem value={opt.value} id={`pt-${opt.value}`} />
                          <Label htmlFor={`pt-${opt.value}`} className="font-body text-sm font-normal cursor-pointer">{opt.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </AccordionContent>
                </AccordionItem>

                {/* Plan Model */}
                <AccordionItem value="plan-model">
                  <AccordionTrigger className="font-body text-sm font-medium py-4">
                    Plan Model
                  </AccordionTrigger>
                  <AccordionContent>
                    <RadioGroup value={planModelFilter} onValueChange={setPlanModelFilter} className="space-y-2 pb-2">
                      {[
                        { value: "all", label: "All" },
                        { value: "one_time", label: "One-time" },
                        { value: "subscription", label: "Subscription" },
                      ].map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <RadioGroupItem value={opt.value} id={`pm-${opt.value}`} />
                          <Label htmlFor={`pm-${opt.value}`} className="font-body text-sm font-normal cursor-pointer">{opt.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </AccordionContent>
                </AccordionItem>

                {/* Sort By */}
                <AccordionItem value="sort-by">
                  <AccordionTrigger className="font-body text-sm font-medium py-4">
                    Sort By
                  </AccordionTrigger>
                  <AccordionContent>
                    <RadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as "priority" | "name" | "date")} className="space-y-2 pb-2">
                      {[
                        { value: "priority", label: "Priority" },
                        { value: "name", label: "Client name" },
                        { value: "date", label: "Recent activity" },
                      ].map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <RadioGroupItem value={opt.value} id={`sb-${opt.value}`} />
                          <Label htmlFor={`sb-${opt.value}`} className="font-body text-sm font-normal cursor-pointer">{opt.label}</Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </ScrollArea>

            <div className="px-6 py-4 border-t border-border">
              <Button
                onClick={() => setFilterOpen(false)}
                className="w-full rounded-sm bg-destructive/80 hover:bg-destructive text-destructive-foreground font-body"
              >
                Show Results
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <span className="ml-auto font-body text-[11px] text-muted-foreground">
          {filtered.length} session{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Drafts */}
      {drafts.length > 0 && (
        <div className="border-b border-border">
          <div className="flex items-center gap-1.5 px-4 py-2.5">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-body text-xs font-medium text-muted-foreground">
              Drafts ({drafts.length})
            </span>
          </div>
          <div className="divide-y divide-border">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <button
                  onClick={() =>
                    draft.sessionId &&
                    router.push(`/stylist/sessions/${draft.sessionId}/moodboards/new`)
                  }
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <div className="h-10 w-10 rounded-sm bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    {draft.images[0] ? (
                      <img src={draft.images[0]} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Image className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-medium truncate">{draft.clientName}</p>
                    <p className="font-body text-[11px] text-muted-foreground">
                      {draft.photoCount} image{draft.photoCount !== 1 ? "s" : ""} · {new Date(draft.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </button>
                <button
                  onClick={async () => {
                    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
                    try {
                      const res = await fetch(`/api/moodboards/${draft.id}`, { method: "DELETE" });
                      if (!res.ok) await reloadDrafts();
                    } catch {
                      await reloadDrafts();
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {filtered.map((session) => {
            const isSelected = selectedId === session.id;
            const badge = sessionTypeBadge[session.sessionType];
            return (
              <div
                key={session.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(session.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedId(session.id);
                  }
                }}
                className={cn(
                  "w-full text-left p-4 transition-colors hover:bg-muted/50 cursor-pointer",
                  isSelected && "bg-muted/80"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-secondary text-secondary-foreground font-body text-xs">
                        {session.clientInitials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-display text-sm font-medium truncate">{session.clientName}</span>
                    <Badge variant="outline" className={cn("rounded-sm text-[9px] font-body shrink-0", badge.className)}>
                      {badge.label}
                    </Badge>
                  </div>
                  <span className="text-[11px] font-body text-muted-foreground shrink-0">{session.lastMessageDate}</span>
                </div>

                <p className="font-body text-sm text-muted-foreground mt-1.5 truncate pl-10">
                  {session.status}
                </p>

                <p className={cn("font-body text-xs mt-1 pl-10", priorityConfig[session.priority].className)}>
                  {session.dueLabel}
                </p>

                <div className="mt-2.5 pl-10">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(session.id);
                      if (session.actionLabel === "Create Moodboard") {
                        router.push(`/stylist/sessions/${session.id}/moodboards/new`);
                        return;
                      }
                      if (session.actionLabel === "Create Look") {
                        router.push(`/stylist/sessions/${session.id}/styleboards/new`);
                        return;
                      }
                      router.push(`/stylist/sessions/${session.id}/workspace`);
                    }}
                    className={cn(
                      "w-full rounded-sm py-2 text-xs font-body font-medium text-center transition-colors",
                      session.priority === "overdue"
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-foreground text-background"
                    )}
                  >
                    {session.actionLabel}
                  </button>
                </div>

                <div className="flex justify-center mt-2">
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="p-8 text-center">
              <p className="font-body text-sm text-muted-foreground">No sessions found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  /* ─── Right Panel (Chat) ─── */
  const rightPanel = selected ? (
    <div className="flex-1 flex flex-col min-w-0 bg-muted/30">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button onClick={() => setSelectedId(null)} className="text-muted-foreground hover:text-foreground mr-1">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-secondary text-secondary-foreground font-body text-sm">
              {selected.clientInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-2">
            <span className="font-display text-sm font-semibold">{selected.clientName}</span>
            <Badge variant="outline" className={cn("rounded-sm text-[9px] font-body", sessionTypeBadge[selected.sessionType].className)}>
              {sessionTypeBadge[selected.sessionType].label}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="font-body text-xs h-8 rounded-sm"
            onClick={() => {
              if (selected.actionLabel === "Create Moodboard") {
                router.push(`/stylist/sessions/${selected.id}/moodboards/new`);
              } else if (selected.actionLabel === "Create Look") {
                router.push(`/stylist/sessions/${selected.id}/styleboards/new`);
              } else {
                router.push(`/stylist/sessions/${selected.id}/workspace`);
              }
            }}
          >
            {selected.actionLabel}
          </Button>
          <Button variant="ghost" size="sm" className="font-body text-xs text-muted-foreground h-8" onClick={() => setDetailOpen(true)}>
            Details
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="px-4 md:px-6 py-4 space-y-1">
          {currentMessages.map((msg, idx) => (
            <div key={msg.id}>
              {shouldShowDate(currentMessages, idx) && (
                <div className="flex justify-center py-4">
                  <span className="bg-background/80 backdrop-blur px-3 py-1 rounded-full text-[11px] font-body text-muted-foreground tracking-wide uppercase">
                    {formatDateSep(msg.timestamp)}
                  </span>
                </div>
              )}
              <div className={cn("flex items-end gap-2 mb-3", msg.sender === "stylist" ? "justify-end" : "justify-start")}>
                {msg.sender === "client" && (
                  <Avatar className="h-7 w-7 shrink-0 mb-5">
                    <AvatarFallback className="bg-secondary text-secondary-foreground font-body text-[10px]">
                      {selected.clientInitials}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex flex-col max-w-sm md:max-w-md">
                  {msg.type === "item_recommendation" && msg.itemData ? (
                    <div className="rounded-2xl overflow-hidden border border-border bg-background rounded-br-sm">
                      <div className="bg-accent/10 px-4 py-2 flex items-center gap-2">
                        <ShoppingBag className="h-3.5 w-3.5 text-accent" />
                        <span className="font-body text-[11px] text-accent font-medium uppercase tracking-wide">Item Recommendation</span>
                      </div>
                      <div className="px-4 py-3 space-y-1">
                        <p className="font-display text-sm font-semibold">{msg.itemData.name}</p>
                        {msg.itemData.brand && <p className="font-body text-xs text-muted-foreground">{msg.itemData.brand}</p>}
                        {msg.itemData.price && <p className="font-body text-sm font-medium text-accent">{msg.itemData.price}</p>}
                        {msg.itemData.note && <p className="font-body text-xs text-muted-foreground mt-1 italic">&ldquo;{msg.itemData.note}&rdquo;</p>}
                      </div>
                    </div>
                  ) : (
                    <div className={cn(
                      "rounded-2xl px-4 py-2.5",
                      msg.sender === "stylist"
                        ? "bg-accent text-accent-foreground rounded-br-sm"
                        : "bg-background text-foreground border border-border rounded-bl-sm"
                    )}>
                      <p className="font-body text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
                    </div>
                  )}
                  <span className={cn(
                    "text-[10px] font-body text-muted-foreground mt-1 px-1",
                    msg.sender === "stylist" ? "text-right" : "text-left"
                  )}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
                {msg.sender === "stylist" && (
                  <Avatar className="h-7 w-7 shrink-0 mb-5">
                    <AvatarFallback className="bg-accent text-accent-foreground font-body text-[10px]">
                      {stylistInitials}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Item Recommendation Form */}
      {itemRecOpen && (
        <div className="px-4 md:px-6 py-3 border-t border-border bg-background">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-accent" />
              <span className="font-body text-sm font-medium">Send item recommendation</span>
            </div>
            <button onClick={() => setItemRecOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Input
              placeholder="Item name *"
              value={itemForm.name}
              onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
              className="h-9 font-body text-sm"
            />
            <Input
              placeholder="Brand"
              value={itemForm.brand}
              onChange={(e) => setItemForm((f) => ({ ...f, brand: e.target.value }))}
              className="h-9 font-body text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Input
              placeholder="Price (e.g. $120)"
              value={itemForm.price}
              onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))}
              className="h-9 font-body text-sm"
            />
            <Input
              placeholder="Stylist note (optional)"
              value={itemForm.note}
              onChange={(e) => setItemForm((f) => ({ ...f, note: e.target.value }))}
              className="h-9 font-body text-sm"
            />
          </div>
          <Input
            placeholder="Product URL *"
            type="url"
            value={itemForm.url}
            onChange={(e) => setItemForm((f) => ({ ...f, url: e.target.value }))}
            className="h-9 font-body text-sm mb-2"
          />
          {itemError && (
            <p className="font-body text-xs text-destructive mb-2">{itemError}</p>
          )}
          <Button
            onClick={handleSendItem}
            disabled={!itemForm.name.trim() || !itemForm.url.trim() || itemSending}
            className="w-full h-9 rounded-sm bg-accent hover:bg-accent/90 text-accent-foreground font-body text-sm"
          >
            {itemSending ? "Sending…" : "Send recommendation"}
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 md:px-6 py-3 border-t border-border bg-background">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground h-10 w-10"
            onClick={() => setItemRecOpen(!itemRecOpen)}
            title="Send item recommendation"
          >
            <ShoppingBag className="h-5 w-5" />
          </Button>
          <div className="flex-1 flex items-center gap-2 rounded-full border border-border bg-muted/40 px-4 py-2.5 focus-within:ring-1 focus-within:ring-ring transition-shadow">
            <input
              type="text"
              placeholder="Type a message..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent font-body text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-foreground h-10 w-10">
            <Mic className="h-5 w-5" />
          </Button>
          {inputValue.trim() && (
            <Button
              onClick={handleSend}
              size="icon"
              className="h-10 w-10 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center bg-muted/30">
      <div className="text-center">
        <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="font-display text-xl text-muted-foreground">Select a session</p>
        <p className="font-body text-sm text-muted-foreground mt-1">Choose a client from your queue to start</p>
      </div>
    </div>
  );

  /* ─── Render ─── */
  return (
    <>
    <ClientDetailPanel
      open={detailOpen}
      onOpenChange={setDetailOpen}
      sessionId={selectedId}
      clientId={selected?.clientId ?? null}
    />
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <header className="h-14 flex items-center justify-between border-b border-border px-4 md:px-6 bg-background shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-foreground flex items-center justify-center">
            <span className="font-display text-xs font-semibold">W</span>
          </div>
          <span className="font-display text-sm font-semibold hidden sm:inline">Wishi</span>
          <span className="text-muted-foreground hidden sm:inline">|</span>
          <span className="font-body text-sm text-muted-foreground hidden sm:inline">Stylist</span>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Calendar className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Settings className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={() => router.push("/stylist/bookings")}
            className="ml-1 px-3 py-2 text-sm font-body text-muted-foreground bg-transparent hover:bg-transparent hover:text-foreground hover:font-semibold transition-all"
          >
            My bookings
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="ml-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              }
            >
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback className="bg-accent text-accent-foreground font-body text-xs">
                  {stylistInitials}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 font-body">
              <DropdownMenuItem onClick={() => router.push("/stylist/profile")}>
                My Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/stylist/dressing-room")}>
                My Dressing Room
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/stylist/settings")}>
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/logout")}>
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {isMobile ? (
          selectedId ? rightPanel : leftPanel
        ) : (
          <>
            {leftPanel}
            {rightPanel}
          </>
        )}
      </div>
    </div>
    </>
  );
}
