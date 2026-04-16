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
        <p className="text-sm text-stone-400">
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
        const isSystem =
          kind === "SYSTEM_AUTOMATED" || kind === "END_SESSION_REQUEST";
        const showDate = shouldShowDateSeparator(msg, messages[i - 1]);

        return (
          <div key={msg.sid}>
            {showDate && (
              <div className="py-2 text-center">
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-400">
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
                />
                {!isSystem && (
                  <span
                    className={`text-[10px] text-stone-300 ${isOwn ? "text-right" : "text-left"}`}
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
