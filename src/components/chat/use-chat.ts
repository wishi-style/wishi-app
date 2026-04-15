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

function toMessage(msg: Message): ChatMessage {
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

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const conversationRef = useRef<Conversation | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchToken = useCallback(async (): Promise<string> => {
    const res = await fetch(`/api/chat/token?sessionId=${sessionId}`);
    if (!res.ok) throw new Error("Failed to fetch chat token");
    const data = await res.json();
    return data.token;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
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
        setMessages(paginator.items.map(toMessage));

        conversation.on("messageAdded", (msg) => {
          if (!cancelled) setMessages((prev) => [...prev, toMessage(msg)]);
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
        setError(err instanceof Error ? err.message : "Failed to connect to chat");
        setIsLoading(false);
      }
    }

    connect();

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
