"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatWindow } from "@/components/chat/chat-window";
import type { ViewerRole } from "@/components/chat/message-renderers";

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

interface Props {
  sessionId: string;
  currentIdentity: string;
  otherUserName: string;
  otherUserAvatar: string | null;
  sessionStatus: string;
  viewerRole: ViewerRole;
  boards: WorkspaceBoard[];
  curated: WorkspaceItem[];
}

type Tab = "chat" | "moodboard" | "styleboards" | "curated";

export function SessionWorkspace({
  sessionId,
  currentIdentity,
  otherUserName,
  otherUserAvatar,
  sessionStatus,
  viewerRole,
  boards,
  curated,
}: Props) {
  const [tab, setTab] = useState<Tab>("chat");

  const moodboards = boards.filter((b) => b.type === "MOODBOARD");
  const styleboards = boards.filter((b) => b.type === "STYLEBOARD");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "chat", label: "Chat" },
    { id: "moodboard", label: "Moodboard", count: moodboards.length || undefined },
    { id: "styleboards", label: "Styleboards", count: styleboards.length || undefined },
    { id: "curated", label: "Curated Pieces", count: curated.length || undefined },
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-4 py-3 text-sm ${
              tab === t.id
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className="ml-1 text-xs text-muted-foreground">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "chat" && (
        <ChatWindow
          sessionId={sessionId}
          currentIdentity={currentIdentity}
          otherUserName={otherUserName}
          otherUserAvatar={otherUserAvatar}
          sessionStatus={sessionStatus}
          viewerRole={viewerRole}
        />
      )}

      {tab === "moodboard" && (
        <div className="flex-1 overflow-y-auto p-6">
          {moodboards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moodboards yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {moodboards.map((b) => (
                <Link
                  key={b.id}
                  href={`/sessions/${sessionId}/moodboards/${b.id}`}
                  className="overflow-hidden rounded-lg border transition hover:opacity-80"
                >
                  {b.thumbnailUrl ? (
                    <img src={b.thumbnailUrl} alt="" className="aspect-square w-full object-cover" />
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
            <p className="text-sm text-muted-foreground">No styleboards yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {styleboards.map((b) => (
                <Link
                  key={b.id}
                  href={`/sessions/${sessionId}/styleboards/${b.id}`}
                  className="overflow-hidden rounded-lg border transition hover:opacity-80"
                >
                  {b.thumbnailUrl ? (
                    <img src={b.thumbnailUrl} alt="" className="aspect-square w-full object-cover" />
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
              No items yet. Items from styleboards land here as your stylist sends them.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {curated.map((it) => (
                <div key={it.id} className="overflow-hidden rounded-lg border">
                  {it.imageUrl ? (
                    <img src={it.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-muted p-2 text-center text-xs text-muted-foreground">
                      {it.label ?? "Item"}
                    </div>
                  )}
                  <div className="p-2">
                    {it.brand && <p className="truncate text-xs">{it.brand}</p>}
                    {it.label && (
                      <p className="truncate text-xs text-muted-foreground">{it.label}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
