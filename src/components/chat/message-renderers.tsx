"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage } from "./use-chat";
import { boardMessageHref } from "./board-href";

export type ViewerRole = "CLIENT" | "STYLIST";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  sessionId: string;
  viewerRole: ViewerRole;
}

export function MessageBubble({
  message,
  isOwn,
  sessionId,
  viewerRole,
}: MessageBubbleProps) {
  const kind = (message.attributes.kind as string) ?? "TEXT";
  const boardId = (message.attributes.boardId as string) ?? null;

  switch (kind) {
    case "TEXT":
      return <TextMessage message={message} isOwn={isOwn} />;
    case "PHOTO":
      return <PhotoMessage message={message} isOwn={isOwn} />;
    case "MOODBOARD":
      return (
        <BoardCard
          label="Moodboard"
          accent="🎨"
          href={boardMessageHref({ kind, sessionId, boardId, viewerRole })}
          isOwn={isOwn}
        />
      );
    case "STYLEBOARD":
      return (
        <BoardCard
          label="Styleboard"
          accent="✨"
          href={boardMessageHref({ kind, sessionId, boardId, viewerRole })}
          isOwn={isOwn}
        />
      );
    case "RESTYLE":
      return (
        <BoardCard
          label="Restyle"
          accent="🔄"
          href={boardMessageHref({ kind, sessionId, boardId, viewerRole })}
          isOwn={isOwn}
        />
      );
    case "SINGLE_ITEM":
      return <SingleItemCard message={message} isOwn={isOwn} />;
    case "END_SESSION_REQUEST":
      return <EndSessionCard sessionId={sessionId} viewerRole={viewerRole} />;
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
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.body}</p>
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
          <img src={mediaUrl} alt="Shared photo" className="max-h-64 w-full object-cover" />
        </a>
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-stone-400">
          Photo unavailable
        </div>
      )}
      {message.body && (
        <p className={`px-4 py-2 text-sm ${isOwn ? "text-white" : "text-stone-800"}`}>
          {message.body}
        </p>
      )}
    </div>
  );
}

function BoardCard({
  label,
  accent,
  href,
  isOwn,
}: {
  label: string;
  accent: string;
  href: string | null;
  isOwn: boolean;
}) {
  const cardClass = `flex max-w-[75%] items-center gap-3 rounded-2xl px-4 py-3 transition ${
    isOwn
      ? "bg-teal-600 text-white hover:bg-teal-700"
      : "border border-stone-200 bg-white text-stone-800 hover:border-stone-300"
  }`;
  const content = (
    <>
      <span className="text-lg">{accent}</span>
      <span className="text-sm font-medium">{label}</span>
      {href && (
        <span className={`ml-2 text-xs ${isOwn ? "text-teal-100" : "text-teal-600"}`}>
          Open →
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {content}
      </Link>
    );
  }
  return <div className={cardClass}>{content}</div>;
}

function SingleItemCard({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  const productId = (message.attributes.singleItemInventoryProductId as string) ?? null;
  const webUrl = (message.attributes.singleItemWebUrl as string) ?? null;
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
      {productId && (
        <Link
          href={`/products/${productId}`}
          className={`mt-1 block text-xs underline ${isOwn ? "text-teal-100" : "text-teal-600"}`}
        >
          View product
        </Link>
      )}
      {!productId && webUrl && (
        <a
          href={webUrl}
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

function EndSessionCard({
  sessionId,
  viewerRole,
}: {
  sessionId: string;
  viewerRole: ViewerRole;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: "approve" | "decline") {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/sessions/${sessionId}/end/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Failed");
        return;
      }
      if (action === "approve") {
        router.push(`/sessions/${sessionId}/end-session`);
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[85%] rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-center">
      <p className="text-sm font-medium text-stone-700">Session end requested</p>
      {viewerRole === "CLIENT" ? (
        <>
          <p className="mt-1 text-xs text-stone-500">
            Your stylist wants to close out. You have 72 hours to approve.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              disabled={pending}
              onClick={() => act("approve")}
              className="rounded-full bg-foreground px-5 py-1.5 text-xs text-background disabled:opacity-50"
            >
              Approve
            </button>
            <button
              disabled={pending}
              onClick={() => act("decline")}
              className="rounded-full border px-5 py-1.5 text-xs disabled:opacity-50"
            >
              Decline
            </button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </>
      ) : (
        <p className="mt-1 text-xs text-stone-400">
          Waiting for the client to approve or decline.
        </p>
      )}
    </div>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="mx-auto flex w-full max-w-[85%] justify-center py-1">
      <span className="inline-block rounded-full border border-stone-200 bg-stone-100/80 px-3 py-1 text-center text-xs italic leading-relaxed text-stone-500">
        {message.body}
      </span>
    </div>
  );
}
