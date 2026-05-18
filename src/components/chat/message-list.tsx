"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "./use-chat";
import { MessageBubble, type ViewerRole } from "./message-renderers";

interface MessageListProps {
  messages: ChatMessage[];
  currentIdentity: string;
  sessionId: string;
  viewerRole: ViewerRole;
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const oneDay = 86400000;

  if (diff < oneDay && now.getDate() === date.getDate()) return "Today";
  if (diff < 2 * oneDay) return "Yesterday";

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function shouldShowDateSeparator(
  current: ChatMessage,
  previous: ChatMessage | undefined,
): boolean {
  if (!previous) return true;
  const currentDate = current.dateCreated.toDateString();
  const previousDate = previous.dateCreated.toDateString();
  return currentDate !== previousDate;
}

// Message kinds that have no visible bubble and must NEVER carry a timestamp.
// SYSTEM_AUTOMATED + END_SESSION_REQUEST render centered cards with their own
// time context; BOARD_UPDATE is a realtime-only signal that renders null.
const TIMESTAMPLESS_KINDS = new Set([
  "SYSTEM_AUTOMATED",
  "END_SESSION_REQUEST",
  "BOARD_UPDATE",
]);

function isTimestamplessKind(kind: string): boolean {
  return TIMESTAMPLESS_KINDS.has(kind);
}

export function MessageList({
  messages,
  currentIdentity,
  sessionId,
  viewerRole,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Start the conversation!
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((msg, i) => {
        const isOwn = msg.author === currentIdentity;
        const kind = (msg.attributes.kind as string) ?? "TEXT";
        const isSystem = kind === "SYSTEM_AUTOMATED" || kind === "END_SESSION_REQUEST";
        const hasTimestamp = !isTimestamplessKind(kind);
        const showDate = shouldShowDateSeparator(msg, messages[i - 1]);

        // Only print the timestamp on the LAST message in a consecutive
        // same-author + same-minute run, so identical times don't stack.
        const next = messages[i + 1];
        const nextKind = next ? ((next.attributes.kind as string) ?? "TEXT") : null;
        const nextSameAuthor =
          next != null &&
          next.author === msg.author &&
          nextKind != null &&
          !isTimestamplessKind(nextKind) &&
          formatTime(next.dateCreated) === formatTime(msg.dateCreated);
        const showTimestamp = hasTimestamp && !nextSameAuthor;

        return (
          <div key={msg.sid}>
            {showDate && (
              <div className="py-2 text-center">
                <span className="rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
                  {formatDateSeparator(msg.dateCreated)}
                </span>
              </div>
            )}
            <div
              className={`flex ${
                isSystem
                  ? "justify-center"
                  : isOwn
                    ? "justify-end"
                    : "justify-start"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  sessionId={sessionId}
                  viewerRole={viewerRole}
                  chatMessages={messages}
                />
                {showTimestamp && (
                  <span
                    className={`text-[10px] text-muted-foreground/70 ${isOwn ? "text-right" : "text-left"}`}
                  >
                    {formatTime(msg.dateCreated)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
