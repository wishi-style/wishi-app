"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  Mic,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  ShoppingBagIcon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useChat } from "@/components/chat/use-chat";
import { MessageList } from "@/components/chat/message-list";

interface Props {
  sessionId: string;
  stylistClerkId: string;
}

/**
 * Stylist Dashboard right-pane chat panel — backend-wired replacement for the
 * Loveable mock. Bootstraps message history from the canonical Message table
 * via /api/sessions/[id]/messages, subscribes to Twilio Conversations realtime
 * via the shared `useChat` hook, sends through /api/sessions/[id]/messages
 * POST so the inline DB mirror covers webhook delivery loss.
 *
 * Renders board cards, photo cards, single-item cards, end-session cards, and
 * system messages via the canonical `MessageBubble` (same renderer the client
 * side uses) so the stylist sees exactly what the client sent and vice-versa.
 *
 * End-session approval/decline (the END_SESSION_REQUEST card) is handled by
 * `MessageBubble`'s `EndSessionCard` which calls real APIs.
 */
export function DashboardChatPanel({ sessionId, stylistClerkId }: Props) {
  const { messages, isLoading, error } = useChat(sessionId);
  const [composer, setComposer] = useState("");
  const [sending, setSending] = useState(false);
  const [itemRecOpen, setItemRecOpen] = useState(false);

  const sendText = useCallback(async () => {
    const body = composer.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "TEXT", body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Couldn't send message");
        return;
      }
      setComposer("");
    } catch (err) {
      console.error("[dashboard-chat] send failed", err);
      toast.error("Couldn't send message");
    } finally {
      setSending(false);
    }
  }, [composer, sending, sessionId]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendText();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {error && (
        <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Reconnecting to chat… messages may be delayed.
        </div>
      )}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Loading messages…
        </div>
      ) : (
        <MessageList
          messages={messages}
          currentIdentity={stylistClerkId}
          sessionId={sessionId}
          viewerRole="STYLIST"
        />
      )}

      <div className="border-t bg-background px-4 py-3 md:px-8 md:py-5">
        <div className="flex max-w-2xl items-center gap-2">
          {/* Rounded-pill composer — Loveable-port of smart-spark-craft
              StylingRoom composer block. Plus popover surfaces attach
              actions; mic + send sit on the trailing edge. The actual file
              upload + voice input are launch follow-ups (C1) — popover
              entries surface as toasts until then. */}
          <div className="flex flex-1 items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 shadow-sm transition-shadow focus-within:ring-1 focus-within:ring-ring">
            <ComposerAttachPopover
              onPickItem={() => setItemRecOpen(true)}
              disabled={sending}
            />
            <input
              type="text"
              placeholder="Type a message..."
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={sending}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              type="button"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              title="Voice message"
              aria-label="Voice message (coming soon)"
              onClick={() => toast.info("Voice messages coming soon")}
            >
              <Mic className="h-5 w-5" />
            </button>
          </div>
          <Button
            onClick={sendText}
            disabled={!composer.trim() || sending}
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
            aria-label="Send message"
          >
            <SendIcon className="h-4 w-4" />
          </Button>
        </div>
        <ItemRecommendationDialog
          sessionId={sessionId}
          open={itemRecOpen}
          onOpenChange={setItemRecOpen}
        />
      </div>
    </div>
  );
}

function ComposerAttachPopover({
  onPickItem,
  disabled,
}: {
  onPickItem: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title="Attach"
          aria-label="Attach"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-52 rounded-lg p-1.5"
      >
        <button
          type="button"
          onClick={() => {
            toast.info("File attachments coming soon");
            setOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          <PaperclipIcon className="h-4 w-4 text-muted-foreground" />
          Add a file
        </button>
        <button
          type="button"
          onClick={() => {
            onPickItem();
            setOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          <ShoppingBagIcon className="h-4 w-4 text-muted-foreground" />
          Recommend an item
        </button>
        <button
          type="button"
          onClick={() => {
            toast.info("Inspiration library coming soon");
            setOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-secondary"
        >
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Inspiration library
        </button>
      </PopoverContent>
    </Popover>
  );
}

function ItemRecommendationDialog({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [webUrl, setWebUrl] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const trimmed = webUrl.trim();
    if (!trimmed) {
      toast.error("Add a product URL");
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("URL must start with http:// or https://");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "SINGLE_ITEM",
          webUrl: trimmed,
          body: body.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Couldn't send recommendation");
        return;
      }
      setWebUrl("");
      setBody("");
      onOpenChange(false);
    } catch (err) {
      console.error("[dashboard-chat] item rec failed", err);
      toast.error("Couldn't send recommendation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recommend an item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rec-url">Product URL</Label>
            <Input
              id="rec-url"
              placeholder="https://store.example.com/product/123"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-note">Note (optional)</Label>
            <Input
              id="rec-note"
              placeholder="Why you picked this"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting || !webUrl.trim()}>
              {submitting ? "Sending…" : "Send recommendation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
