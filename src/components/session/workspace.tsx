"use client";

import * as React from "react";
import Link from "next/link";
import { ChatWindow } from "@/components/chat/chat-window";
import type { ViewerRole } from "@/components/chat/message-renderers";
import { SuggestedReplies } from "./suggested-replies";
import { SessionSidebar } from "./session-sidebar";

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
  sessionStatus: string;
  viewerRole: ViewerRole;
  boards: WorkspaceBoard[];
  curated: WorkspaceItem[];
  cart: WorkspaceCartItem[];
  progress: WorkspaceProgress;
}

type Tab = "chat" | "moodboard" | "styleboards" | "curated" | "cart";

const suggestedRepliesEnabled =
  process.env.NEXT_PUBLIC_FEATURE_AI_SUGGESTED_REPLIES === "true";

export function SessionWorkspace({
  sessionId,
  currentIdentity,
  otherUserName,
  otherUserAvatar,
  sessionStatus,
  viewerRole,
  boards,
  curated,
  cart,
  progress,
}: Props) {
  const [tab, setTab] = React.useState<Tab>("chat");

  const moodboards = boards.filter((b) => b.type === "MOODBOARD");
  const styleboards = boards.filter((b) => b.type === "STYLEBOARD");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "chat", label: "Chat" },
    {
      id: "moodboard",
      label: "Moodboard",
      count: moodboards.length || undefined,
    },
    {
      id: "styleboards",
      label: "Styleboards",
      count: styleboards.length || undefined,
    },
    {
      id: "curated",
      label: "Curated",
      count: curated.length || undefined,
    },
    { id: "cart", label: "Cart", count: cart.length || undefined },
  ];

  const cartSubtotal = cart.reduce(
    (acc, c) => acc + c.priceInCents * c.quantity,
    0,
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <div className="flex flex-1 min-h-0 flex-col">
        <div className="flex border-b border-border overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`border-b-2 px-4 py-3 text-sm whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "border-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count != null && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({t.count})
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "chat" && (
          <div className="flex flex-1 min-h-0 flex-col">
            <div className="flex-1 min-h-0">
              <ChatWindow
                sessionId={sessionId}
                currentIdentity={currentIdentity}
                otherUserName={otherUserName}
                otherUserAvatar={otherUserAvatar}
                sessionStatus={sessionStatus}
                viewerRole={viewerRole}
              />
            </div>
            {/* Suggested replies surface for stylists composing responses.
                Flag-gated; real LLM suggestions land in Phase 7. */}
            {suggestedRepliesEnabled && viewerRole === "STYLIST" ? (
              <SuggestedReplies sessionId={sessionId} />
            ) : null}
          </div>
        )}

        {tab === "moodboard" && (
          <div className="flex-1 overflow-y-auto p-6">
            {moodboards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No moodboards yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {moodboards.map((b) => (
                  <Link
                    key={b.id}
                    href={`/sessions/${sessionId}/moodboards/${b.id}`}
                    className="overflow-hidden rounded-lg border border-border transition hover:opacity-80"
                  >
                    {b.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.thumbnailUrl}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted text-sm text-muted-foreground">
                        Draft
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-medium">Moodboard</p>
                      <p className="text-xs text-muted-foreground">
                        {b.sentAt ? (b.rating ?? "Awaiting feedback") : "Not sent"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "styleboards" && (
          <div className="flex-1 overflow-y-auto p-6">
            {styleboards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No styleboards yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {styleboards.map((b) => (
                  <Link
                    key={b.id}
                    href={`/sessions/${sessionId}/styleboards/${b.id}`}
                    className="overflow-hidden rounded-lg border border-border transition hover:opacity-80"
                  >
                    {b.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.thumbnailUrl}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted text-sm text-muted-foreground">
                        Draft
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-medium">
                        {b.isRevision ? "Restyle" : "Styleboard"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {b.sentAt ? (b.rating ?? "Awaiting feedback") : "Not sent"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "curated" && (
          <div className="flex-1 overflow-y-auto p-6">
            {curated.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items yet. Items from styleboards land here as your stylist
                sends them.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                {curated.map((it) => (
                  <div
                    key={it.id}
                    className="overflow-hidden rounded-lg border border-border"
                  >
                    {it.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={it.imageUrl}
                        alt=""
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground">
                        {it.label ?? "Item"}
                      </div>
                    )}
                    <div className="p-2">
                      {it.brand && (
                        <p className="truncate text-xs">{it.brand}</p>
                      )}
                      {it.label && (
                        <p className="truncate text-xs text-muted-foreground">
                          {it.label}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "cart" && (
          <div className="flex-1 overflow-y-auto p-6">
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Your bag is empty. Tap a product in a styleboard to add it.
              </p>
            ) : (
              <>
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
                          className="h-16 w-16 rounded-md object-cover bg-muted"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-md bg-muted" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs uppercase tracking-widest text-dark-taupe">
                          {row.brand}
                        </p>
                        <p className="text-sm truncate">{row.name}</p>
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
                    className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
                  >
                    Review & checkout
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {viewerRole === "CLIENT" ? (
        <SessionSidebar sessionId={sessionId} progress={progress} />
      ) : null}
    </div>
  );
}
