"use client";

// Stylist session workspace — Loveable StylingRoom chrome adapted for the
// stylist's perspective (the Loveable source renders the client viewing a
// stylist; here the left rail surfaces the CLIENT + stylist-authoring
// actions). Chat uses the real ChatWindow; boards / curated / cart tabs
// reuse the data from `getWorkspaceData`.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChatWindow } from "@/components/chat/chat-window";
import type {
  WorkspaceBoard,
  WorkspaceItem,
  WorkspaceCartItem,
  WorkspaceProgress,
} from "@/components/session/workspace";
import type { ViewerRole } from "@/components/chat/message-renderers";

type Tab = "chat" | "styleboards" | "curated" | "cart";

interface Props {
  sessionId: string;
  sessionStatus: string;
  sessionType: "mini" | "major" | "lux";
  isClosed: boolean;
  currentIdentity: string;
  clientName: string;
  clientAvatarUrl: string | null;
  clientLocation: string | null;
  canRequestEnd: boolean;
  boards: WorkspaceBoard[];
  curated: WorkspaceItem[];
  cart: WorkspaceCartItem[];
  progress: WorkspaceProgress;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "styleboards", label: "Style Boards" },
  { id: "curated", label: "Curated Pieces" },
  { id: "cart", label: "Cart" },
];

export function StylistWorkspace({
  sessionId,
  sessionStatus,
  sessionType,
  isClosed,
  currentIdentity,
  clientName,
  clientAvatarUrl,
  clientLocation,
  canRequestEnd,
  boards,
  curated,
  cart,
  progress,
}: Props) {
  const [activeTab, setActiveTab] = React.useState<Tab>("chat");
  const styleboards = boards.filter((b) => b.type === "STYLEBOARD");
  const initials = clientName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const badgeClass = cn(
    "rounded-sm text-[10px] font-body font-medium border-0",
    sessionType === "lux"
      ? "bg-gradient-to-r from-[hsl(38,40%,50%)] to-[hsl(28,50%,60%)] text-white shadow-sm"
      : "bg-secondary text-secondary-foreground",
  );
  const badgeLabel =
    sessionType === "lux" ? "✦ Lux" : sessionType === "major" ? "Major" : "Mini";

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-[hsl(var(--sidebar-background,0_0%_97%))] flex-col">
        <div className="p-5 border-b border-border">
          <Link
            href="/stylist/sessions"
            className="flex items-center gap-2 text-sm font-body text-muted-foreground hover:text-foreground transition-colors mb-5"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Sessions
          </Link>

          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              {clientAvatarUrl ? (
                <AvatarImage src={clientAvatarUrl} alt={clientName} />
              ) : null}
              <AvatarFallback className="bg-secondary text-secondary-foreground font-display">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="font-display text-lg leading-tight truncate">
                {clientName}
              </h2>
              {clientLocation && (
                <p className="text-xs text-muted-foreground font-body truncate">
                  {clientLocation}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <Badge variant="outline" className={badgeClass}>
              {badgeLabel}
            </Badge>
            {isClosed && (
              <Badge
                variant="outline"
                className="rounded-sm text-[10px] font-body border-muted-foreground/30 text-muted-foreground"
              >
                Closed
              </Badge>
            )}
          </div>
        </div>

        <nav className="flex-1 py-3 px-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-body transition-colors mb-0.5 rounded-md",
                activeTab === tab.id
                  ? "text-foreground font-medium bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50",
              )}
            >
              {tab.label}
              {tab.id === "cart" && cart.length > 0 && (
                <span className="ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-foreground text-background text-[10px] font-medium px-1.5">
                  {cart.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 border-t border-border space-y-2">
          <Link
            href={`/stylist/sessions/${sessionId}/moodboards/new`}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-body font-medium text-muted-foreground bg-background border border-border hover:text-foreground hover:border-foreground transition-colors"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Build Moodboard
          </Link>
          <Link
            href={`/stylist/sessions/${sessionId}/styleboards/new`}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-body font-medium text-foreground bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Build Styleboard
          </Link>
          {canRequestEnd && (
            <EndSessionButton sessionId={sessionId} />
          )}
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden absolute top-16 left-0 right-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/stylist/sessions"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <Avatar className="h-8 w-8">
            {clientAvatarUrl ? (
              <AvatarImage src={clientAvatarUrl} alt={clientName} />
            ) : null}
            <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-xs">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-sm leading-tight truncate">
              {clientName}
            </h2>
          </div>
          <Badge variant="outline" className={cn(badgeClass, "text-[9px] shrink-0")}>
            {badgeLabel}
          </Badge>
        </div>
        <div className="flex overflow-x-auto border-t border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 px-4 py-2.5 text-xs font-body transition-colors border-b-2",
                activeTab === tab.id
                  ? "text-foreground font-medium border-foreground"
                  : "text-muted-foreground border-transparent",
              )}
            >
              {tab.label}
              {tab.id === "cart" && cart.length > 0 && (
                <span className="ml-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-foreground text-background text-[9px] font-medium px-1">
                  {cart.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-[88px] md:hidden shrink-0" />

        {activeTab === "chat" && (
          <div className="flex-1 min-h-0">
            <ChatWindow
              sessionId={sessionId}
              currentIdentity={currentIdentity}
              otherUserName={clientName}
              otherUserAvatar={clientAvatarUrl}
              sessionStatus={sessionStatus}
              viewerRole={"STYLIST" satisfies ViewerRole}
              hideHeader
            />
          </div>
        )}

        {activeTab === "styleboards" && (
          <StyleboardsTab sessionId={sessionId} styleboards={styleboards} progress={progress} />
        )}

        {activeTab === "curated" && <CuratedTab curated={curated} />}

        {activeTab === "cart" && <CartTab cart={cart} />}
      </div>
    </div>
  );
}

function EndSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function onClick() {
    if (!confirm("Send an end-session request to the client?")) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/end/request`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-1">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={onClick}
        disabled={pending}
        className="w-full rounded-lg px-4 py-2.5 text-xs font-body text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {pending ? "Sending…" : "Request to end session"}
      </button>
    </div>
  );
}

function StyleboardsTab({
  sessionId,
  styleboards,
  progress,
}: {
  sessionId: string;
  styleboards: WorkspaceBoard[];
  progress: WorkspaceProgress;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-xl">Style Boards</h3>
          <p className="text-xs text-muted-foreground font-body">
            {progress.styleboardsSent} of {progress.boardCount} sent
            {progress.revisionsSent > 0 && ` · ${progress.revisionsSent} restyles`}
          </p>
        </div>
        <Link
          href={`/stylist/sessions/${sessionId}/styleboards/new`}
          className="rounded-full bg-foreground text-background px-4 py-1.5 text-xs font-body font-medium hover:opacity-90 transition-opacity"
        >
          New Look
        </Link>
      </div>
      {styleboards.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body">
          No styleboards yet. Tap &ldquo;New Look&rdquo; to start composing.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {styleboards.map((b, idx) => (
            <Link
              key={b.id}
              href={`/stylist/sessions/${sessionId}/styleboards/${b.id}`}
              className="rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <h4 className="font-display text-lg mb-1">
                {b.isRevision ? `Restyle ${idx + 1}` : `Board ${idx + 1}`}
              </h4>
              <p className="font-body text-xs text-muted-foreground mb-3">
                {b.sentAt
                  ? `Sent · ${b.rating ?? "Awaiting feedback"}`
                  : "Draft"}
              </p>
              <div className="aspect-square overflow-hidden rounded-md bg-muted">
                {b.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    No preview
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CuratedTab({ curated }: { curated: WorkspaceItem[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
      <h3 className="font-display text-xl mb-4">All Curated Pieces</h3>
      {curated.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body">
          No items sent yet. Items from your styleboards land here once they ship.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {curated.map((it) => (
            <div
              key={it.id}
              className="rounded-lg border border-border bg-card p-4 flex flex-col"
            >
              <div className="aspect-[3/4] overflow-hidden rounded-md mb-3 bg-muted">
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt={it.label ?? ""}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    {it.label ?? "Item"}
                  </div>
                )}
              </div>
              <p className="font-body text-sm font-medium text-foreground text-center truncate">
                {it.brand ?? " "}
              </p>
              <p className="font-body text-xs text-muted-foreground text-center mt-0.5 truncate">
                {it.label ?? ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CartTab({ cart }: { cart: WorkspaceCartItem[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
      {cart.length === 0 ? (
        <p className="text-muted-foreground font-body text-sm">
          The client hasn&rsquo;t added any items to their cart yet.
        </p>
      ) : (
        <>
          <h3 className="font-display text-xl mb-4">
            Client Cart ({cart.length})
          </h3>
          <div className="space-y-4">
            {cart.map((item) => (
              <div
                key={item.cartItemId}
                className="flex gap-4 rounded-lg border border-border bg-card p-4"
              >
                <div className="h-24 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex flex-1 flex-col justify-between min-w-0">
                  <div>
                    <p className="font-body text-xs uppercase tracking-widest text-muted-foreground">
                      {item.brand}
                    </p>
                    <p className="font-body text-sm text-foreground truncate">
                      {item.name}
                    </p>
                    <p className="font-body text-xs text-muted-foreground mt-0.5">
                      Qty {item.quantity}
                    </p>
                  </div>
                  <p className="font-body text-sm text-foreground">
                    {formatCents(item.priceInCents * item.quantity)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
