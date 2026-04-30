"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ChatWindow } from "@/components/chat/chat-window";
import { BuyLooksDialog } from "@/components/billing/buy-looks-dialog";
import type { ViewerRole } from "@/components/chat/message-renderers";
import { SuggestedReplies } from "./suggested-replies";

export interface WorkspaceBoard {
  id: string;
  type: "MOODBOARD" | "STYLEBOARD";
  isRevision: boolean;
  sentAt: string | null;
  rating: string | null;
  thumbnailUrl: string | null;
}

export interface WorkspaceItem {
  id: string;
  source: string;
  orderIndex: number;
  boardId: string;
  boardSentAt: string | null;
  imageUrl: string | null;
  label: string | null;
  brand: string | null;
}

export interface WorkspaceCartItem {
  cartItemId: string;
  inventoryProductId: string;
  quantity: number;
  name: string;
  brand: string;
  imageUrl: string | null;
  priceInCents: number;
}

export interface WorkspaceProgress {
  planType: "MINI" | "MAJOR" | "LUX" | string;
  /** How many styleboards the plan entitles */
  boardCount: number;
  styleboardsSent: number;
  revisionsSent: number;
  itemsSent: number;
  additionalLookPriceCents: number;
}

interface Props {
  sessionId: string;
  currentIdentity: string;
  otherUserName: string;
  otherUserAvatar: string | null;
  /**
   * Loveable's StylingRoom shows the stylist's primary location ("Los Angeles")
   * as a small subtitle under the name in the left rail. Threads through from
   * the page-level Prisma query (User.locations[isPrimary=true]).
   */
  otherUserLocation?: string | null;
  sessionStatus: string;
  viewerRole: ViewerRole;
  boards: WorkspaceBoard[];
  curated: WorkspaceItem[];
  cart: WorkspaceCartItem[];
  progress: WorkspaceProgress;
  /** Optional override; defaults to viewport-locked height */
  heightClass?: string;
  /** Stylist's public profile id; if set, the sidebar avatar + name link to it. */
  stylistProfileId?: string | null;
  /**
   * Loveable contract: INQUIRY sessions get a chat-only shell with a "Book"
   * CTA in place of Buy Looks / Upgrade Plan. The booking URL goes here.
   */
  bookCtaHref?: string | null;
  /** First name of the stylist used in the "Book {firstName}" CTA. */
  stylistFirstName?: string | null;
}

type Tab = "chat" | "styleboards" | "curated" | "cart";

const ALL_TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "styleboards", label: "Style Boards" },
  { id: "curated", label: "Curated Pieces" },
  { id: "cart", label: "Cart" },
];

const CLOSED_STATUSES = new Set([
  "ENDED",
  "CLOSED",
  "EXPIRED",
  "REFUNDED",
  "CANCELLED",
  "CANCELED",
  "COMPLETED",
]);

const suggestedRepliesEnabled =
  process.env.NEXT_PUBLIC_FEATURE_AI_SUGGESTED_REPLIES === "true";

export function SessionWorkspace({
  sessionId,
  currentIdentity,
  otherUserName,
  otherUserAvatar,
  otherUserLocation = null,
  sessionStatus,
  viewerRole,
  boards,
  curated,
  cart,
  progress,
  heightClass = "h-screen",
  stylistProfileId = null,
  bookCtaHref = null,
  stylistFirstName = null,
}: Props) {
  const isInquiry = sessionStatus.toUpperCase() === "INQUIRY";
  const tabs = isInquiry ? ALL_TABS.filter((t) => t.id === "chat") : ALL_TABS;
  const [activeTab, setActiveTab] = React.useState<Tab>("chat");
  const [buyOpen, setBuyOpen] = React.useState(false);

  const styleboards = boards.filter((b) => b.type === "STYLEBOARD");
  const cartSubtotal = cart.reduce(
    (acc, c) => acc + c.priceInCents * c.quantity,
    0,
  );

  const planType = (progress.planType ?? "").toUpperCase();
  const isLux = planType === "LUX";
  const isMajor = planType === "MAJOR";
  const badgeLabel = isLux ? "✦ Lux" : isMajor ? "Major" : "Mini";
  const badgeClass = cn(
    "rounded-sm text-[10px] font-medium border-0",
    isLux
      ? "bg-gradient-to-r from-[hsl(38,40%,50%)] to-[hsl(28,50%,60%)] text-white shadow-sm"
      : "bg-secondary text-secondary-foreground",
  );

  const isClosed = CLOSED_STATUSES.has(sessionStatus.toUpperCase());

  const initials =
    otherUserName
      .split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const looksTotal = progress.boardCount;
  const looksDone = progress.styleboardsSent;
  const donePct =
    looksTotal > 0
      ? Math.min(100, Math.round((looksDone / looksTotal) * 100))
      : 0;
  const looksOverdelivered = looksTotal > 0 && looksDone > looksTotal;
  const additionalLookDollars = Math.round(
    progress.additionalLookPriceCents / 100,
  );

  return (
    <div className={`flex ${heightClass} overflow-hidden bg-background`}>
      {/* Desktop left rail — Loveable parity (back / stylist info / plan badge /
       *  progress / vertical tabs / Buy Looks + Upgrade Plan). */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-[hsl(var(--sidebar-background,0_0%_97%))]">
        <div className="border-b border-border p-5">
          <Link
            href="/sessions"
            className="mb-5 inline-flex items-center gap-2 text-sm text-foreground transition-colors hover:text-foreground/70"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Link>

          {(() => {
            const meta = (
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11">
                  {otherUserAvatar ? (
                    <AvatarImage src={otherUserAvatar} alt={otherUserName} />
                  ) : null}
                  <AvatarFallback className="bg-secondary text-secondary-foreground font-display">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="font-display text-lg leading-tight truncate">
                    {otherUserName}
                  </h2>
                  {otherUserLocation && (
                    <p className="truncate text-xs font-body text-muted-foreground">
                      {otherUserLocation}
                    </p>
                  )}
                </div>
              </div>
            );
            return stylistProfileId ? (
              <Link
                href={`/stylists/${stylistProfileId}`}
                className="group block transition-opacity hover:opacity-80"
              >
                {meta}
              </Link>
            ) : (
              meta
            );
          })()}

          <div className="mt-3 flex items-center gap-2">
            {isInquiry ? (
              <Badge
                variant="outline"
                className="rounded-sm border-0 bg-secondary text-[10px] font-medium text-secondary-foreground"
              >
                Inquiry
              </Badge>
            ) : (
              <Badge variant="outline" className={badgeClass}>
                {badgeLabel}
              </Badge>
            )}
            {isClosed && (
              <Badge
                variant="outline"
                className="rounded-sm border-muted-foreground/30 text-[10px] text-muted-foreground"
              >
                Closed
              </Badge>
            )}
          </div>

          {!isInquiry && looksTotal > 0 && (
            <div className="mt-4">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-muted-foreground">
                  {looksOverdelivered ? "Deliverable exceeded" : "Looks delivered"}
                </span>
                <span className="tabular-nums">
                  {looksDone} / {looksTotal}
                </span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground transition-[width]"
                  style={{ width: `${donePct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 py-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "mb-0.5 flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm transition-colors",
                activeTab === tab.id
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.id === "cart" && cart.length > 0 && (
                <span className="ml-auto inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-medium text-background">
                  {cart.length}
                </span>
              )}
            </button>
          ))}
        </nav>

        {isInquiry ? (
          <div className="mt-auto space-y-2 border-t border-border p-4">
            {bookCtaHref && (
              <Link
                href={bookCtaHref}
                className="flex w-full items-center justify-center rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Book {stylistFirstName ?? otherUserName.split(" ")[0]}
              </Link>
            )}
            <p className="text-center text-[10px] text-muted-foreground">
              Ready to start a styling session?
            </p>
          </div>
        ) : (
          <div className="mt-auto space-y-2 border-t border-border p-4">
            <button
              type="button"
              onClick={() => setBuyOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-[4px] border border-border bg-background px-4 py-2 text-[11px] text-muted-foreground transition-colors hover:border-foreground/50 hover:text-foreground"
            >
              <PlusIcon className="h-3 w-3" />
              buy more looks
              {additionalLookDollars > 0 && (
                <span className="text-muted-foreground/70">
                  · ${additionalLookDollars}
                </span>
              )}
            </button>
            {!isLux && (
              <Link
                href="/settings"
                className="flex w-full items-center justify-center rounded-lg border border-border px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                Upgrade Plan
              </Link>
            )}
          </div>
        )}
      </aside>

      {/* Mobile header — back / avatar / plan badge + horizontal tab bar. */}
      <div className="absolute left-0 right-0 top-16 z-20 border-b border-border bg-background md:hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/sessions"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <Avatar className="h-8 w-8">
            {otherUserAvatar ? (
              <AvatarImage src={otherUserAvatar} alt={otherUserName} />
            ) : null}
            <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm leading-tight truncate">
              {otherUserName}
            </h2>
          </div>
          {isInquiry ? (
            <Badge
              variant="outline"
              className="shrink-0 rounded-sm border-0 bg-secondary text-[9px] font-medium text-secondary-foreground"
            >
              Inquiry
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className={cn(badgeClass, "shrink-0 text-[9px]")}
            >
              {badgeLabel}
            </Badge>
          )}
        </div>
        <div className="flex overflow-x-auto border-t border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-2.5 text-xs transition-colors",
                activeTab === tab.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {tab.label}
              {tab.id === "cart" && cart.length > 0 && (
                <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-medium text-background">
                  {cart.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 min-w-0 flex-col">
        <div className="h-[88px] shrink-0 md:hidden" />

        {activeTab === "chat" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <ChatWindow
                sessionId={sessionId}
                currentIdentity={currentIdentity}
                otherUserName={otherUserName}
                otherUserAvatar={otherUserAvatar}
                sessionStatus={sessionStatus}
                viewerRole={viewerRole}
                hideHeader
                bookCtaHref={bookCtaHref}
                stylistFirstName={stylistFirstName}
                recapHref={
                  viewerRole === "CLIENT"
                    ? `/sessions/${sessionId}/end-session`
                    : null
                }
              />
            </div>
            {suggestedRepliesEnabled && viewerRole === "STYLIST" ? (
              <SuggestedReplies sessionId={sessionId} />
            ) : null}
          </div>
        )}

        {activeTab === "styleboards" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
            {styleboards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No styleboards yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {styleboards.map((b, idx) => (
                  <Link
                    key={b.id}
                    href={`/sessions/${sessionId}/styleboards/${b.id}`}
                    className="rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <h4 className="font-display text-lg leading-tight">
                      {b.isRevision ? `Restyle ${idx + 1}` : `Board ${idx + 1}`}
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {b.sentAt
                        ? `Sent · ${b.rating ?? "Awaiting feedback"}`
                        : "Draft"}
                    </p>
                    <div className="mt-3 aspect-square overflow-hidden rounded-md bg-muted">
                      {b.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={b.thumbnailUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                          No preview
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "curated" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
            <h3 className="mb-4 font-display text-xl">All Curated Pieces</h3>
            {curated.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items yet. Items from styleboards land here as your stylist
                sends them.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
                {curated.map((it) => (
                  <div
                    key={it.id}
                    className="flex flex-col rounded-lg border border-border bg-card p-4"
                  >
                    <div className="mb-3 aspect-[3/4] overflow-hidden rounded-md bg-muted">
                      {it.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.imageUrl}
                          alt={it.label ?? ""}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                          {it.label ?? "Item"}
                        </div>
                      )}
                    </div>
                    <p className="truncate text-center text-sm font-medium text-foreground">
                      {it.brand ?? " "}
                    </p>
                    <p className="mt-0.5 truncate text-center text-xs text-muted-foreground">
                      {it.label ?? ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "cart" && (
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
            {cart.length === 0 ? (
              <div className="text-center">
                <h3 className="font-display text-2xl">Let&rsquo;s fill up your cart</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Browse your curated pieces and add your favorites.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab("curated")}
                  className="mt-4 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background hover:opacity-90 transition-opacity"
                >
                  Browse Curated Pieces
                </button>
              </div>
            ) : (
              <>
                <h3 className="mb-4 font-display text-xl">
                  Your Cart ({cart.length})
                </h3>
                <ul className="space-y-3">
                  {cart.map((row) => (
                    <li
                      key={row.cartItemId}
                      className="flex items-center gap-4 rounded-xl border border-border p-3"
                    >
                      {row.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={row.imageUrl}
                          alt={row.name}
                          className="h-16 w-16 rounded-md bg-muted object-cover"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-md bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs uppercase tracking-widest text-muted-foreground">
                          {row.brand}
                        </p>
                        <p className="truncate text-sm">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Qty {row.quantity}
                        </p>
                      </div>
                      <p className="text-sm tabular-nums">
                        ${Math.round((row.priceInCents * row.quantity) / 100)}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="font-display text-xl tabular-nums">
                      ${Math.round(cartSubtotal / 100)}
                    </p>
                  </div>
                  <Link
                    href="/cart"
                    className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
                  >
                    Review &amp; checkout
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <BuyLooksDialog
        sessionId={sessionId}
        additionalLookDollars={additionalLookDollars}
        open={buyOpen}
        onOpenChange={setBuyOpen}
      />
    </div>
  );
}
