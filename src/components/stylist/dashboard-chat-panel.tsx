"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { SendIcon, ShoppingBagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

      <div className="border-t bg-background p-3">
        <div className="flex items-center gap-2">
          <ItemRecommendationButton sessionId={sessionId} disabled={sending} />
          <Input
            placeholder="Type a message..."
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={sendText}
            disabled={!composer.trim() || sending}
            aria-label="Send message"
          >
            <SendIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ItemRecommendationButton({
  sessionId,
  disabled,
}: {
  sessionId: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
    } catch (err) {
      console.error("[dashboard-chat] item rec failed", err);
      toast.error("Couldn't send recommendation");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="icon"
            variant="ghost"
            disabled={disabled}
            aria-label="Recommend an item"
          >
            <ShoppingBagIcon className="h-4 w-4" />
          </Button>
        }
      />
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
              onClick={() => setOpen(false)}
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
