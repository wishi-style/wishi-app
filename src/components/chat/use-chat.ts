"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Conversation, Message } from "@twilio/conversations";

export interface ChatMessage {
  sid: string;
  author: string | null;
  body: string | null;
  dateCreated: Date;
  attributes: Record<string, unknown>;
}

interface DbMessage {
  id: string;
  text: string | null;
  mediaUrl: string | null;
  kind: string;
  boardId: string | null;
  singleItemInventoryProductId: string | null;
  singleItemWebUrl: string | null;
  authorClerkId: string | null;
  sender: "stylist" | "client" | "system";
  createdAt: string;
}

function fromTwilio(msg: Message): ChatMessage {
  let attrs: Record<string, unknown> = {};
  try {
    const raw = msg.attributes;
    if (typeof raw === "object" && raw !== null) attrs = raw as Record<string, unknown>;
  } catch {
    // ignore
  }
  return {
    sid: msg.sid,
    author: msg.author,
    body: msg.body,
    dateCreated: msg.dateCreated ?? new Date(),
    attributes: attrs,
  };
}

function fromDb(m: DbMessage): ChatMessage {
  // Synthetic SID for DB-bootstrapped rows so they can be deduped against
  // Twilio rows when the realtime connection arrives.
  return {
    sid: `db-${m.id}`,
    author: m.authorClerkId,
    body: m.text,
    dateCreated: new Date(m.createdAt),
    attributes: {
      kind: m.kind,
      ...(m.mediaUrl !== null && { mediaUrl: m.mediaUrl }),
      ...(m.boardId !== null && { boardId: m.boardId }),
      ...(m.singleItemInventoryProductId !== null && {
        singleItemInventoryProductId: m.singleItemInventoryProductId,
      }),
      ...(m.singleItemWebUrl !== null && { singleItemWebUrl: m.singleItemWebUrl }),
    },
  };
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track BOTH attempt completion AND outcome separately so a fast-failing
  // Twilio (e.g. missing channel) doesn't surface an error before the DB
  // bootstrap has had a chance to render historical messages. The chat is
  // "broken" only if BOTH paths have run and BOTH failed.
  const dbBootstrappedRef = useRef(false);
  const twilioSeededRef = useRef(false);
  const dbAttemptFinishedRef = useRef(false);
  const twilioAttemptFinishedRef = useRef(false);

  const fetchToken = useCallback(async (): Promise<string> => {
    const res = await fetch(`/api/chat/token?sessionId=${sessionId}`);
    if (!res.ok) throw new Error("Failed to fetch chat token");
    const data = await res.json();
    return data.token;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    // Bootstrap from DB so the chat body renders historical messages even if
    // Twilio is unreachable (channel doesn't exist, service down, dev env
    // without creds). Twilio is the realtime delta — DB is canonical.
    async function bootstrapFromDb() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/messages?limit=50`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { messages: DbMessage[] };
        if (cancelled) return;
        // If Twilio already seeded messages, don't clobber the authoritative
        // realtime list with the stale DB snapshot.
        if (!twilioSeededRef.current) {
          setMessages(data.messages.map(fromDb));
        }
        dbBootstrappedRef.current = true;
        // Twilio may have set a fast-fail error before us; clear it now that
        // we have historical messages to render — the realtime gap is
        // already telegraphed by the existing "Reconnecting…" banner.
        if (!cancelled) setError(null);
      } catch (err) {
        console.error("[useChat] DB bootstrap failed:", err);
        // Twilio may have already finished and failed silently (waiting on
        // us); now that we know we can't help either, surface the error.
        if (
          !cancelled &&
          twilioAttemptFinishedRef.current &&
          !twilioSeededRef.current
        ) {
          setError("Unable to load chat history");
        }
      } finally {
        dbAttemptFinishedRef.current = true;
        if (!cancelled) setIsLoading(false);
      }
    }

    async function connectTwilio() {
      try {
        const token = await fetchToken();
        if (cancelled) return;

        const client = new Client(token);
        clientRef.current = client;

        client.on("connectionStateChanged", (state) => {
          if (!cancelled) setIsConnected(state === "connected");
        });

        client.on("tokenAboutToExpire", async () => {
          try {
            const newToken = await fetchToken();
            await client.updateToken(newToken);
          } catch (err) {
            console.error("[useChat] Token refresh failed:", err);
          }
        });

        const conversation = await client.getConversationByUniqueName(
          `session-${sessionId}`,
        );
        if (cancelled) { client.shutdown(); return; }
        conversationRef.current = conversation;

        const paginator = await conversation.getMessages(50);
        if (cancelled) { client.shutdown(); return; }
        // Replace DB-bootstrapped rows with Twilio's authoritative paginator
        // — Twilio has the real SIDs for sendMediaMessage/sendTextMessage.
        setMessages(paginator.items.map(fromTwilio));
        twilioSeededRef.current = true;

        conversation.on("messageAdded", (msg) => {
          if (!cancelled) setMessages((prev) => [...prev, fromTwilio(msg)]);
        });

        setIsConnected(true);
        setIsLoading(false);

        refreshTimerRef.current = setInterval(
          async () => {
            try {
              const newToken = await fetchToken();
              await client.updateToken(newToken);
            } catch (err) {
              console.error("[useChat] Scheduled token refresh failed:", err);
            }
          },
          50 * 60 * 1000,
        );
      } catch (err) {
        if (cancelled) return;
        console.error("[useChat] Connection failed:", err);
        // Only surface the error when BOTH paths have finished and BOTH
        // failed. If DB bootstrap is still in flight, defer the verdict —
        // when it lands and succeeds it will clear any pending error; if
        // it fails it'll set the error itself.
        if (dbAttemptFinishedRef.current && !dbBootstrappedRef.current) {
          setError(err instanceof Error ? err.message : "Failed to connect to chat");
        }
        setIsLoading(false);
      } finally {
        twilioAttemptFinishedRef.current = true;
      }
    }

    void bootstrapFromDb();
    void connectTwilio();

    return () => {
      cancelled = true;
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      conversationRef.current?.removeAllListeners();
      clientRef.current?.shutdown();
      clientRef.current = null;
      conversationRef.current = null;
    };
  }, [fetchToken, sessionId]);

  const sendTextMessage = useCallback(async (text: string) => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    await conversation.sendMessage(text, {
      kind: "TEXT",
    });
  }, []);

  const sendMediaMessage = useCallback(
    async (
      mediaUrl: string,
      kind: string,
      extraAttributes: Record<string, unknown> = {},
    ) => {
      const conversation = conversationRef.current;
      if (!conversation) return;
      await conversation.sendMessage("", {
        kind,
        mediaUrl,
        ...extraAttributes,
      });
    },
    [],
  );

  return {
    messages,
    sendTextMessage,
    sendMediaMessage,
    isConnected,
    isLoading,
    error,
  };
}
