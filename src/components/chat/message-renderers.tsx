"use client";

import type { ChatMessage } from "./use-chat";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
}

export function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  const kind = (message.attributes.kind as string) ?? "TEXT";

  switch (kind) {
    case "TEXT":
      return <TextMessage message={message} isOwn={isOwn} />;
    case "PHOTO":
      return <PhotoMessage message={message} isOwn={isOwn} />;
    case "MOODBOARD":
      return <BoardPlaceholder type="Moodboard" isOwn={isOwn} />;
    case "STYLEBOARD":
      return <BoardPlaceholder type="Styleboard" isOwn={isOwn} />;
    case "RESTYLE":
      return <BoardPlaceholder type="Restyle Request" isOwn={isOwn} />;
    case "SINGLE_ITEM":
      return <SingleItemPlaceholder message={message} isOwn={isOwn} />;
    case "END_SESSION_REQUEST":
      return <EndSessionPlaceholder />;
    case "SYSTEM_AUTOMATED":
      return <SystemMessage message={message} />;
    default:
      return <TextMessage message={message} isOwn={isOwn} />;
  }
}

function TextMessage({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  return (
    <div
      className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
        isOwn
          ? "bg-teal-600 text-white"
          : "border border-stone-200 bg-white text-stone-800"
      }`}
    >
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {message.body}
      </p>
    </div>
  );
}

function PhotoMessage({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const mediaUrl = (message.attributes.mediaUrl as string) ?? null;

  return (
    <div
      className={`max-w-[75%] overflow-hidden rounded-2xl ${
        isOwn ? "bg-teal-600" : "border border-stone-200 bg-white"
      }`}
    >
      {mediaUrl ? (
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt="Shared photo"
            className="max-h-64 w-full object-cover"
          />
        </a>
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-stone-400">
          Photo unavailable
        </div>
      )}
      {message.body && (
        <p
          className={`px-4 py-2 text-sm ${isOwn ? "text-white" : "text-stone-800"}`}
        >
          {message.body}
        </p>
      )}
    </div>
  );
}

function BoardPlaceholder({ type, isOwn }: { type: string; isOwn: boolean }) {
  return (
    <div
      className={`flex max-w-[75%] items-center gap-3 rounded-2xl px-4 py-3 ${
        isOwn
          ? "bg-teal-600 text-white"
          : "border border-stone-200 bg-white text-stone-800"
      }`}
    >
      <span className="text-lg">🎨</span>
      <span className="text-sm font-medium">{type}</span>
    </div>
  );
}

function SingleItemPlaceholder({
  message,
  isOwn,
}: {
  message: ChatMessage;
  isOwn: boolean;
}) {
  const url = (message.attributes.singleItemWebUrl as string) ?? null;

  return (
    <div
      className={`max-w-[75%] rounded-2xl px-4 py-3 ${
        isOwn
          ? "bg-teal-600 text-white"
          : "border border-stone-200 bg-white text-stone-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-lg">👗</span>
        <span className="text-sm font-medium">Product Suggestion</span>
      </div>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-1 block text-xs underline ${isOwn ? "text-teal-100" : "text-teal-600"}`}
        >
          View item
        </a>
      )}
    </div>
  );
}

function EndSessionPlaceholder() {
  return (
    <div className="mx-auto max-w-[85%] rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-center">
      <p className="text-sm font-medium text-stone-700">
        Session end requested
      </p>
      <p className="mt-1 text-xs text-stone-400">
        Approve/Decline actions coming soon
      </p>
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="mx-auto max-w-[85%] py-1 text-center">
      <p className="text-xs leading-relaxed text-stone-400">{message.body}</p>
    </div>
  );
}
