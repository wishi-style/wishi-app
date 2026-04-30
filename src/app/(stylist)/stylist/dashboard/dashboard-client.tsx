"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getDrafts, deleteDraft, type MoodBoardDraft } from "@/lib/moodBoardDrafts";
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
  SearchIcon,
  SendIcon,
  MicIcon,
  PlusIcon,
  AlertTriangleIcon,
  ClockIcon,
  MessageCircleIcon,
  SparklesIcon,
  ChevronDownIcon,
  ArrowLeftIcon,
  BellIcon,
  CalendarIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  CrownIcon,
  StarIcon,
  HeartIcon,
  ShoppingBagIcon,
  XIcon,
  ImageIcon,
  FileTextIcon,
  PaperclipIcon,
  VideoIcon,
  Trash2Icon as TrashIcon,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import ClientDetailPanel from "@/components/stylist/client-detail-panel";
import { toast } from "sonner";
import { ArchiveIcon, InboxIcon } from "lucide-react";
import { NotificationsPopover } from "@/components/stylist/NotificationsPopover";


/* ─── Types ─── */
type SessionPriority = "overdue" | "due_today" | "active" | "new" | "completed";
type SessionType = "mini" | "major" | "lux";

type LoyaltyTier = "new" | "bronze" | "silver" | "gold" | "vip";

interface MockSession {
  id: string;
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
  endedAt?: string; // ISO timestamp when client APPROVED end (session completed)
  endRequestedAt?: string; // ISO timestamp when stylist requested to end the session
}

interface ChatAttachment {
  url: string;
  name: string;
  kind: "image" | "video" | "file";
  mime: string;
  size: number;
}

interface ChatMessage {
  id: string;
  sender: "stylist" | "client" | "system";
  text: string;
  timestamp: Date;
  type?: "text" | "item_recommendation" | "end_request" | "end_approved" | "attachment";
  itemData?: { name: string; brand: string; price: string; link?: string; imageUrl?: string; note?: string };
  attachment?: ChatAttachment;
  endRequestId?: string; // session id for end request actions
}

const loyaltyConfig: Record<LoyaltyTier, { label: string; icon: React.ElementType; className: string }> = {
  new: { label: "New Client", icon: SparklesIcon, className: "text-foreground bg-muted" },
  bronze: { label: "Bronze", icon: StarIcon, className: "text-amber-800 bg-amber-100" },
  silver: { label: "Silver", icon: StarIcon, className: "text-slate-500 bg-slate-100" },
  gold: { label: "Gold", icon: CrownIcon, className: "text-amber-600 bg-amber-50" },
  vip: { label: "VIP", icon: CrownIcon, className: "text-accent bg-accent/10" },
};

/* ─── Mock Data ─── */
const mockSessions: MockSession[] = [
  {
    id: "s1",
    clientName: "Feizhen Dang",
    clientInitials: "FD",
    sessionType: "lux",
    priority: "overdue",
    dueLabel: "Due: 33 days ago",
    lastMessage: "New Booking - active",
    lastMessageDate: "Mar 28",
    boardsDelivered: 0,
    boardsTotal: 3,
    status: "New Booking - active",
    actionLabel: "Create Moodboard",
    loyaltyTier: "gold",
    totalSessions: 8,
  },
  {
    id: "s2",
    clientName: "Crystal Stokey",
    clientInitials: "CS",
    sessionType: "major",
    priority: "due_today",
    dueLabel: "Due Today",
    lastMessage: "Crystal's comment: Like some items.",
    lastMessageDate: "Mar 27",
    boardsDelivered: 1,
    boardsTotal: 2,
    status: "Crystal's comment: Like some items.",
    actionLabel: "Create Look",
    loyaltyTier: "silver",
    totalSessions: 4,
  },
  {
    id: "s3",
    clientName: "Natalie Ramos",
    clientInitials: "NR",
    sessionType: "mini",
    priority: "due_today",
    dueLabel: "Due Today",
    lastMessage: "New booking - needs moodboard",
    lastMessageDate: "Mar 27",
    boardsDelivered: 0,
    boardsTotal: 1,
    status: "New booking - needs moodboard",
    actionLabel: "Create Moodboard",
    loyaltyTier: "new",
    totalSessions: 1,
  },
  {
    id: "s4",
    clientName: "Marcus Johnson",
    clientInitials: "MJ",
    sessionType: "lux",
    priority: "active",
    dueLabel: "Due in 3 days",
    lastMessage: "The style board is perfect! Let me know about alternatives for the jacket.",
    lastMessageDate: "Mar 25",
    boardsDelivered: 2,
    boardsTotal: 3,
    status: "Style board delivered",
    actionLabel: "View session",
    loyaltyTier: "vip",
    totalSessions: 15,
  },
  {
    id: "s5",
    clientName: "Emma Blakewell",
    clientInitials: "EB",
    sessionType: "major",
    priority: "active",
    dueLabel: "Due in 5 days",
    lastMessage: "Thanks for the recommendations! I'll review them tonight.",
    lastMessageDate: "Mar 24",
    boardsDelivered: 1,
    boardsTotal: 2,
    status: "Awaiting feedback",
    actionLabel: "View session",
    loyaltyTier: "bronze",
    totalSessions: 3,
  },
  {
    id: "s6",
    clientName: "Sofia Nakamura",
    clientInitials: "SN",
    sessionType: "mini",
    priority: "new",
    dueLabel: "Respond within 24h",
    lastMessage: "Just booked! Need help with work-from-home outfits.",
    lastMessageDate: "Mar 28",
    boardsDelivered: 0,
    boardsTotal: 1,
    status: "New booking",
    actionLabel: "Start styling",
    loyaltyTier: "new",
    totalSessions: 1,
  },
  {
    id: "s7",
    clientName: "Daniel Kim",
    clientInitials: "DK",
    sessionType: "lux",
    priority: "new",
    dueLabel: "Respond within 24h",
    lastMessage: "Looking forward to a full wardrobe overhaul for spring.",
    lastMessageDate: "Mar 28",
    boardsDelivered: 0,
    boardsTotal: 3,
    status: "New booking",
    actionLabel: "Start styling",
    loyaltyTier: "gold",
    totalSessions: 10,
  },
  {
    id: "s8",
    clientName: "Olivia Bennett",
    clientInitials: "OB",
    sessionType: "major",
    priority: "active",
    dueLabel: "All boards delivered",
    lastMessage: "Loved everything! Ready to wrap up.",
    lastMessageDate: "Mar 26",
    boardsDelivered: 2,
    boardsTotal: 2,
    status: "All boards delivered",
    actionLabel: "Create Look",
    loyaltyTier: "silver",
    totalSessions: 6,
  },
  {
    id: "s9",
    clientName: "Hannah Wright",
    clientInitials: "HW",
    sessionType: "mini",
    priority: "completed",
    dueLabel: "Session ended",
    lastMessage: "Thanks so much, this was perfect!",
    lastMessageDate: "Mar 20",
    boardsDelivered: 1,
    boardsTotal: 1,
    status: "Session ended",
    actionLabel: "View summary",
    loyaltyTier: "bronze",
    totalSessions: 2,
    // Ended ~3 days ago — already archived
    endedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const mockChats: Record<string, ChatMessage[]> = {
  s1: [
    { id: "1", sender: "client", text: "Friday at 2 would work for me", timestamp: new Date(2026, 1, 24, 11, 22) },
    { id: "2", sender: "stylist", text: "Perfect! I'll schedule the call via Concierge for us and you should be receiving their email with details for the call by end of the day! 💗 I look forward to our chat!", timestamp: new Date(2026, 1, 24, 12, 41) },
    { id: "3", sender: "stylist", text: "Hey Feizhen! I'm excited to chat in a few minutes!", timestamp: new Date(2026, 1, 27, 13, 47) },
    { id: "4", sender: "stylist", text: "Hi Feizhen! I held on the call, but perhaps you weren't able to hop on. I have availability Monday from 9AM-11:30 and 3-5PM. On Tuesday I have availability from 9:30-2PM, and as I mentioned I will be going out of office and returning on March 11. Let me know if these times work for you or if you prefer to wait until March 11 when I return! Very best!", timestamp: new Date(2026, 1, 27, 14, 16) },
  ],
  s2: [
    { id: "1", sender: "client", text: "I like some of the items but the colors aren't quite right for me.", timestamp: new Date(2026, 2, 26, 10, 0) },
    { id: "2", sender: "stylist", text: "Thanks for the feedback Crystal! I'll adjust the palette. Are you leaning more towards warm or cool tones?", timestamp: new Date(2026, 2, 26, 10, 30) },
    { id: "3", sender: "client", text: "Warm tones for sure — think burnt orange, olive, warm browns.", timestamp: new Date(2026, 2, 26, 11, 15) },
  ],
  s3: [
    { id: "1", sender: "client", text: "Hi! Just booked a mini session. Looking for casual but polished looks.", timestamp: new Date(2026, 2, 27, 9, 0) },
  ],
  s4: [
    { id: "1", sender: "stylist", text: "Here's your updated style board with the jacket alternatives!", timestamp: new Date(2026, 2, 24, 14, 0) },
    { id: "2", sender: "client", text: "The style board is perfect! Let me know about alternatives for the jacket.", timestamp: new Date(2026, 2, 25, 9, 30) },
  ],
  s5: [
    { id: "1", sender: "stylist", text: "Your curated pieces are ready! Take a look when you get a chance.", timestamp: new Date(2026, 2, 23, 16, 0) },
    { id: "2", sender: "client", text: "Thanks for the recommendations! I'll review them tonight.", timestamp: new Date(2026, 2, 24, 18, 0) },
  ],
  s6: [
    { id: "1", sender: "client", text: "Just booked! Need help with work-from-home outfits.", timestamp: new Date(2026, 2, 28, 8, 0) },
  ],
  s7: [
    { id: "1", sender: "client", text: "Looking forward to a full wardrobe overhaul for spring.", timestamp: new Date(2026, 2, 28, 10, 0) },
  ],
};

/* ─── Priority helpers ─── */
const priorityOrder: Record<SessionPriority, number> = {
  overdue: 0,
  due_today: 1,
  new: 2,
  active: 3,
  completed: 4,
};

const priorityConfig: Record<SessionPriority, { icon: React.ElementType; className: string }> = {
  overdue: { icon: AlertTriangleIcon, className: "text-destructive" },
  due_today: { icon: ClockIcon, className: "text-amber-600" },
  active: { icon: MessageCircleIcon, className: "text-accent" },
  new: { icon: SparklesIcon, className: "text-foreground" },
  completed: { icon: ClockIcon, className: "text-muted-foreground" },
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
export default function StylistDashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<StatFilter | null>(null);
  const [folder, setFolder] = useState<"inbox" | "archive">("inbox");
  const [sessions, setSessions] = useState<MockSession[]>(mockSessions);
  const [sessionTypeFilter, setSessionTypeFilter] = useState<SessionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pendingActionFilter, setPendingActionFilter] = useState<string>("all");
  const [planModelFilter, setPlanModelFilter] = useState<string>("all");
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachmentAccept, setAttachmentAccept] = useState<string>("*/*");
  const [pendingAttachment, setPendingAttachment] = useState<ChatAttachment | null>(null);
  const [sortBy, setSortBy] = useState<"priority" | "name" | "date">("priority");
  const [filterOpen, setFilterOpen] = useState(false);
  const [itemRecOpen, setItemRecOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", brand: "", price: "", link: "", note: "" });
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(mockChats);
  const [detailOpen, setDetailOpen] = useState(false);
  const [drafts, setDrafts] = useState<MoodBoardDraft[]>(getDrafts());
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Tick to re-evaluate archived state every minute
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const ARCHIVE_DELAY_MS = 24 * 60 * 60 * 1000;
  const isArchived = (s: MockSession) =>
    // eslint-disable-next-line react-hooks/purity
    !!s.endedAt && Date.now() - new Date(s.endedAt).getTime() >= ARCHIVE_DELAY_MS;
  const isEndedActive = (s: MockSession) => !!s.endedAt && !isArchived(s);

  const visibleSessions = sessions.filter((s) =>
    folder === "archive" ? isArchived(s) : !isArchived(s)
  );

  // Auto-select the first session on desktop when nothing is selected yet
  useEffect(() => {
    if (!isMobile && selectedId === null && visibleSessions.length > 0) {
      setSelectedId(visibleSessions[0].id);
    }
  }, [isMobile, selectedId, visibleSessions]);

  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  // Stats (current folder only)
  const overdueCount = visibleSessions.filter((s) => s.priority === "overdue").length;
  const dueTodayCount = visibleSessions.filter((s) => s.priority === "due_today").length;
  const newCount = visibleSessions.filter((s) => s.priority === "new").length;
  const activeCount = visibleSessions.filter((s) => s.priority === "active").length;
  const allCount = visibleSessions.length;
  const archiveCount = sessions.filter(isArchived).length;
  const inboxCount = sessions.filter((s) => !isArchived(s)).length;

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

  const endSession = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (!session) return;
    if (session.endRequestedAt && !session.endedAt) {
      toast.info("End request already sent", { description: "Awaiting client approval." });
      return;
    }
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, endRequestedAt: new Date().toISOString(), status: "End requested — awaiting client", actionLabel: "View session" }
          : s
      )
    );
    // Post end-request card into the chat
    const msg: ChatMessage = {
      id: `end-req-${Date.now()}`,
      sender: "stylist",
      text: "Requested to end this session.",
      timestamp: new Date(),
      type: "end_request",
      endRequestId: id,
    };
    setMessages((prev) => ({ ...prev, [id]: [...(prev[id] || []), msg] }));
    toast.success("End-session request sent", {
      description: "Client must approve before the session is marked completed.",
    });
  };

  const approveEndSession = (id: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              endedAt: new Date().toISOString(),
              priority: "completed" as SessionPriority,
              status: "Completed",
              actionLabel: "View summary",
            }
          : s
      )
    );
    const msg: ChatMessage = {
      id: `end-ok-${Date.now()}`,
      sender: "client",
      text: "Approved end of session.",
      timestamp: new Date(),
      type: "end_approved",
    };
    setMessages((prev) => ({ ...prev, [id]: [...(prev[id] || []), msg] }));
    toast.success("Session completed", {
      description: "Chat will move to Archive in 24 hours.",
    });
  };

  const reopenSession = (id: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, endedAt: undefined, endRequestedAt: undefined, status: "Reopened", actionLabel: "View session" }
          : s
      )
    );
    setFolder("inbox");
    toast.success("Session reopened", { description: "Moved back to Active bookings." });
  };

  const filtered = visibleSessions
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

  // Scroll chat on selection or new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedId, messages]);

  const clearPendingAttachment = () => {
    if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url);
    setPendingAttachment(null);
  };

  const handleSend = () => {
    if (!selectedId) return;
    if (!inputValue.trim() && !pendingAttachment) return;
    const stamp = Date.now();
    const newMessages: ChatMessage[] = [];
    if (pendingAttachment) {
      newMessages.push({
        id: `stylist-att-${stamp}`,
        sender: "stylist",
        text: pendingAttachment.name,
        timestamp: new Date(),
        type: "attachment",
        attachment: pendingAttachment,
      });
    }
    if (inputValue.trim()) {
      newMessages.push({
        id: `stylist-${stamp}`,
        sender: "stylist",
        text: inputValue.trim(),
        timestamp: new Date(),
      });
    }
    setMessages((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] || []), ...newMessages],
    }));
    setInputValue("");
    setPendingAttachment(null); // don't revoke — message is using the URL
  };

  const handleSendItem = () => {
    if (!itemForm.name.trim() || !selectedId) return;
    const link = itemForm.link.trim();
    if (link && !/^https?:\/\//i.test(link)) {
      toast.error("Link must start with http:// or https://");
      return;
    }
    const newMsg: ChatMessage = {
      id: `stylist-item-${Date.now()}`,
      sender: "stylist",
      text: `Recommended: ${itemForm.name}`,
      timestamp: new Date(),
      type: "item_recommendation",
      itemData: { name: itemForm.name, brand: itemForm.brand, price: itemForm.price, link: link || undefined, note: itemForm.note },
    };
    setMessages((prev) => ({
      ...prev,
      [selectedId]: [...(prev[selectedId] || []), newMsg],
    }));
    setItemForm({ name: "", brand: "", price: "", link: "", note: "" });
    setItemRecOpen(false);
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
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search client by name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 font-body text-sm rounded-sm bg-background"
          />
        </div>
      </div>

      {/* Folder tabs */}
      <div className="flex items-center gap-1 px-4 pt-3 border-b border-border">
        {[
          { key: "inbox" as const, label: "Active bookings", count: inboxCount, Icon: InboxIcon },
          { key: "archive" as const, label: "Archive", count: archiveCount, Icon: ArchiveIcon },
        ].map(({ key, label, count, Icon }) => (
          <button
            key={key}
            onClick={() => {
              setFolder(key);
              setSelectedId(null);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 font-body text-xs transition-colors",
              folder === key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
            <span className="text-[10px] text-muted-foreground">({count})</span>
          </button>
        ))}
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
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-sm font-body text-xs border-border relative">
              <SlidersHorizontalIcon className="h-3.5 w-3.5" />
              Filter & Sort
              {hasActiveFilters && (
                <span className="h-2 w-2 rounded-full bg-accent absolute -top-0.5 -right-0.5" />
              )}
            </Button>
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
              <Accordion type="multiple" className="px-6">
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
            <FileTextIcon className="h-3.5 w-3.5 text-muted-foreground" />
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
                  onClick={() => router.push(`/stylist/sessions/${draft.id}/moodboards/new`)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left"
                >
                  <div className="h-10 w-10 rounded-sm bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                    {draft.images[0] ? (
                      <Image src={draft.images[0]} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-sm font-medium truncate">{draft.clientName}</p>
                    <p className="font-body text-[11px] text-muted-foreground">
                      {draft.images.length} image{draft.images.length !== 1 ? "s" : ""} · {new Date(draft.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => {
                    deleteDraft(draft.id);
                    setDrafts(getDrafts());
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
              <button
                key={session.id}
                onClick={() => setSelectedId(session.id)}
                className={cn(
                  "w-full text-left p-4 transition-colors hover:bg-muted/50",
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
                  {session.boardsDelivered >= session.boardsTotal ? (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(session.id);
                          router.push(`/stylist/sessions/${session.id}/styleboards/new`);
                        }}
                        className="flex-1 rounded-sm py-2 text-xs font-body font-medium text-center bg-foreground text-background transition-colors"
                      >
                        Create look
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          endSession(session.id);
                        }}
                        disabled={!!session.endRequestedAt}
                        className="flex-1 rounded-sm py-2 text-xs font-body font-medium text-center border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {session.endRequestedAt ? "Awaiting approval" : "End session"}
                      </button>
                    </div>
                  ) : (
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
                  )}
                </div>

                <div className="flex justify-center mt-2">
                  <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (() => {
            const otherFolderMatches = sessions.filter((s) => {
              const inOther = folder === "inbox" ? isArchived(s) : !isArchived(s);
              const matches = !searchQuery || s.clientName.toLowerCase().includes(searchQuery.toLowerCase());
              return inOther && matches;
            });
            return (
              <div className="p-8 text-center space-y-3">
                <p className="font-body text-sm text-muted-foreground">No sessions found</p>
                {otherFolderMatches.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-sm font-body text-xs"
                    onClick={() => setFolder(folder === "inbox" ? "archive" : "inbox")}
                  >
                    {folder === "inbox" ? <ArchiveIcon className="h-3.5 w-3.5" /> : <InboxIcon className="h-3.5 w-3.5" />}
                    {otherFolderMatches.length} match{otherFolderMatches.length !== 1 ? "es" : ""} in {folder === "inbox" ? "Archive" : "Active bookings"}
                  </Button>
                )}
              </div>
            );
          })()}
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
              <ArrowLeftIcon className="h-5 w-5" />
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
          {selected.endedAt ? (
            <>
              <Badge variant="outline" className="rounded-sm text-[10px] font-body bg-muted text-muted-foreground border-muted">
                <ArchiveIcon className="h-3 w-3 mr-1" />
                {isArchived(selected) ? "Archived" : "Completed"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="font-body text-xs h-8 rounded-sm"
                onClick={() => reopenSession(selected.id)}
              >
                Reopen session
              </Button>
            </>
          ) : selected.endRequestedAt ? (
            <>
              <Badge variant="outline" className="rounded-sm text-[10px] font-body bg-amber-50 text-amber-700 border-amber-200">
                <ClockIcon className="h-3 w-3 mr-1" />
                Awaiting client approval
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="font-body text-xs h-8 rounded-sm"
                onClick={() => approveEndSession(selected.id)}
              >
                Simulate approval
              </Button>
            </>
          ) : selected.boardsDelivered >= selected.boardsTotal ? (
            <>
              <Button
                size="sm"
                className="font-body text-xs h-8 rounded-sm"
                onClick={() =>
                  router.push(`/stylist/sessions/${selected.id}/styleboards/new`)
                }
              >
                Create look
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="font-body text-xs h-8 rounded-sm"
                onClick={() => endSession(selected.id)}
              >
                End session
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="font-body text-xs h-8 rounded-sm"
              onClick={() => {
                if (selected.actionLabel === "Create Moodboard") {
                  router.push(`/stylist/sessions/${selected.id}/moodboards/new`);
                } else if (selected.actionLabel === "Create Look") {
                  router.push(`/stylist/sessions/${selected.id}/styleboards/new`);
                }
              }}
            >
              {selected.actionLabel}
            </Button>
          )}
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

              {msg.type === "end_request" ? (
                <div className="flex justify-center my-3">
                  <div className="w-full max-w-md rounded-sm border border-border bg-background p-4 text-center space-y-3">
                    <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                      <ArchiveIcon className="h-3.5 w-3.5" />
                      <span className="font-body text-[11px] uppercase tracking-wide">End-session request</span>
                    </div>
                    <p className="font-body text-sm">
                      <span className="font-medium">Stylist</span> requested to end this session.
                    </p>
                    {selected.endedAt ? (
                      <Badge variant="outline" className="rounded-sm bg-muted text-muted-foreground border-muted font-body text-[10px]">
                        Approved by client
                      </Badge>
                    ) : (
                      <div className="flex gap-2 justify-center">
                        <Button
                          size="sm"
                          className="rounded-sm font-body text-xs"
                          onClick={() => msg.endRequestId && approveEndSession(msg.endRequestId)}
                        >
                          Simulate client approval
                        </Button>
                      </div>
                    )}
                    <p className="font-body text-[10px] text-muted-foreground">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              ) : msg.type === "end_approved" ? (
                <div className="flex justify-center my-3">
                  <div className="w-full max-w-md rounded-sm border border-border bg-muted/30 p-3 text-center">
                    <p className="font-body text-xs text-muted-foreground">
                      Client approved end of session — marked Completed. Moves to Archive in 24h.
                    </p>
                  </div>
                </div>
              ) : (
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
                          <ShoppingBagIcon className="h-3.5 w-3.5 text-accent" />
                          <span className="font-body text-[11px] text-accent font-medium uppercase tracking-wide">Item Recommendation</span>
                        </div>
                        <div className="px-4 py-3 space-y-1">
                          <p className="font-display text-sm font-semibold">{msg.itemData.name}</p>
                          {msg.itemData.brand && <p className="font-body text-xs text-muted-foreground">{msg.itemData.brand}</p>}
                          {msg.itemData.price && <p className="font-body text-sm font-medium text-accent">{msg.itemData.price}</p>}
                          {msg.itemData.link && (
                            <a
                              href={msg.itemData.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-body text-xs text-accent underline break-all hover:opacity-80"
                            >
                              View item
                            </a>
                          )}
                          {msg.itemData.note && <p className="font-body text-xs text-muted-foreground mt-1 italic">&quot;{msg.itemData.note}&quot;</p>}
                        </div>
                      </div>
                    ) : msg.type === "attachment" && msg.attachment ? (
                      <div className={cn(
                        "rounded-2xl overflow-hidden border border-border bg-background",
                        msg.sender === "stylist" ? "rounded-br-sm" : "rounded-bl-sm"
                      )}>
                        {msg.attachment.kind === "image" ? (
                          <a href={msg.attachment.url} target="_blank" rel="noopener noreferrer">
                            <Image
                              src={msg.attachment.url}
                              alt={msg.attachment.name}
                              width={256}
                              height={256}
                              unoptimized
                              className="max-h-64 w-auto object-cover"
                            />
                          </a>
                        ) : msg.attachment.kind === "video" ? (
                          <video
                            src={msg.attachment.url}
                            controls
                            className="max-h-64 w-full bg-black"
                          />
                        ) : (
                          <a
                            href={msg.attachment.url}
                            download={msg.attachment.name}
                            className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
                          >
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-body text-sm font-medium truncate">{msg.attachment.name}</p>
                              <p className="font-body text-xs text-muted-foreground">
                                {(msg.attachment.size / 1024).toFixed(0)} KB
                              </p>
                            </div>
                          </a>
                        )}
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
                        SM
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </ScrollArea>

      {/* Item Recommendation Form */}
      {itemRecOpen && (
        <div className="sticky bottom-[68px] z-10 px-4 md:px-6 py-3 border-t border-border bg-background">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShoppingBagIcon className="h-4 w-4 text-accent" />
              <span className="font-body text-sm font-medium">Send item recommendation</span>
            </div>
            <button onClick={() => setItemRecOpen(false)} className="text-muted-foreground hover:text-foreground">
              <XIcon className="h-4 w-4" />
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
            placeholder="Product link (https://...)"
            type="url"
            value={itemForm.link}
            onChange={(e) => setItemForm((f) => ({ ...f, link: e.target.value }))}
            className="h-9 font-body text-sm mb-2"
          />
          <Button
            onClick={handleSendItem}
            disabled={!itemForm.name.trim()}
            className="w-full h-9 rounded-sm bg-accent hover:bg-accent/90 text-accent-foreground font-body text-sm"
          >
            Send recommendation
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 z-10 px-4 md:px-6 py-3 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {pendingAttachment && (
          <div className="mb-2 flex items-center gap-3 p-2 pr-3 rounded-lg border border-border bg-muted/40">
            {pendingAttachment.kind === "image" ? (
              <Image
                src={pendingAttachment.url}
                alt={pendingAttachment.name}
                width={56}
                height={56}
                unoptimized
                className="h-14 w-14 rounded-md object-cover shrink-0"
              />
            ) : pendingAttachment.kind === "video" ? (
              <video
                src={pendingAttachment.url}
                muted
                className="h-14 w-14 rounded-md object-cover shrink-0 bg-black"
              />
            ) : (
              <div className="h-14 w-14 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                <FileTextIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-medium truncate">{pendingAttachment.name}</p>
              <p className="font-body text-xs text-muted-foreground">
                {pendingAttachment.kind === "image" ? "Photo" : pendingAttachment.kind === "video" ? "Video" : "File"}
                {" · "}
                {(pendingAttachment.size / 1024).toFixed(0)} KB
              </p>
            </div>
            <button
              onClick={clearPendingAttachment}
              className="shrink-0 h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="Remove attachment"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground hover:text-foreground h-10 w-10"
            onClick={() => setItemRecOpen(!itemRecOpen)}
            title="Send item recommendation"
          >
            <ShoppingBagIcon className="h-5 w-5" />
          </Button>
          <input
            ref={attachmentInputRef}
            type="file"
            hidden
            accept={attachmentAccept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (pendingAttachment) URL.revokeObjectURL(pendingAttachment.url);
                const kind: ChatAttachment["kind"] = file.type.startsWith("image/")
                  ? "image"
                  : file.type.startsWith("video/")
                  ? "video"
                  : "file";
                setPendingAttachment({
                  url: URL.createObjectURL(file),
                  name: file.name,
                  kind,
                  mime: file.type,
                  size: file.size,
                });
              }
              e.target.value = "";
            }}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-foreground h-10 w-10"
                title="Send attachment"
              >
                <PaperclipIcon className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="font-body">
              <DropdownMenuItem
                onClick={() => {
                  setAttachmentAccept("image/*");
                  setTimeout(() => attachmentInputRef.current?.click(), 0);
                }}
              >
                <ImageIcon className="h-4 w-4 mr-2" /> Photo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setAttachmentAccept("video/*");
                  setTimeout(() => attachmentInputRef.current?.click(), 0);
                }}
              >
                <VideoIcon className="h-4 w-4 mr-2" /> Video
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setAttachmentAccept("*/*");
                  setTimeout(() => attachmentInputRef.current?.click(), 0);
                }}
              >
                <FileTextIcon className="h-4 w-4 mr-2" /> File
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
            <MicIcon className="h-5 w-5" />
          </Button>
          {(inputValue.trim() || pendingAttachment) && (
            <Button
              onClick={handleSend}
              size="icon"
              className="h-10 w-10 rounded-full bg-accent hover:bg-accent/90 text-accent-foreground"
            >
              <SendIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex-1 flex items-center justify-center bg-muted/30">
      <div className="text-center">
        <MessageCircleIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="font-display text-xl text-muted-foreground">Select a session</p>
        <p className="font-body text-sm text-muted-foreground mt-1">Choose a client from your queue to start</p>
      </div>
    </div>
  );

  /* ─── Render ─── */
  return (
    <>
    <ClientDetailPanel open={detailOpen} onOpenChange={setDetailOpen} sessionId={selectedId} />
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
            <CalendarIcon className="h-5 w-5" />
          </Button>
          <NotificationsPopover />
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <SettingsIcon className="h-5 w-5" />
          </Button>
          <button
            type="button"
            onClick={() => router.push("/stylist/bookings")}
            className="ml-1 px-3 py-2 text-sm font-body text-muted-foreground bg-transparent hover:bg-transparent hover:text-foreground hover:font-semibold transition-all"
          >
            My bookings
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar className="h-8 w-8 cursor-pointer">
                  <AvatarFallback className="bg-accent text-accent-foreground font-body text-xs">
                    SM
                  </AvatarFallback>
                </Avatar>
              </button>
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
