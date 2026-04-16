import { prisma } from "@/lib/prisma";
import type { MessageKind } from "@/generated/prisma/client";

interface TwilioMessageEvent {
  ConversationSid: string;
  MessageSid: string;
  Author: string;
  Body: string;
  Attributes: string;
  DateCreated: string;
}

export async function handleMessageAdded(event: TwilioMessageEvent) {
  const session = await prisma.session.findUnique({
    where: { twilioChannelSid: event.ConversationSid },
    select: { id: true },
  });

  if (!session) {
    console.warn(
      `[twilio-webhook] No session found for conversation ${event.ConversationSid}`,
    );
    return;
  }

  // Look up user by Twilio identity (clerkId)
  let userId: string | null = null;
  if (event.Author && event.Author !== "system") {
    const user = await prisma.user.findUnique({
      where: { clerkId: event.Author },
      select: { id: true },
    });
    userId = user?.id ?? null;
  }

  // Parse message attributes for structured metadata
  let attributes: Record<string, unknown> = {};
  try {
    attributes = event.Attributes ? JSON.parse(event.Attributes) : {};
  } catch {
    // Ignore malformed attributes
  }

  const kind = (attributes.kind as MessageKind) ?? "TEXT";
  const mediaUrl = (attributes.mediaUrl as string) ?? null;
  const mediaS3Key = (attributes.mediaS3Key as string) ?? null;
  const rawBoardId = (attributes.boardId as string) ?? null;
  const singleItemInventoryProductId =
    (attributes.singleItemInventoryProductId as string) ?? null;
  const singleItemWebUrl = (attributes.singleItemWebUrl as string) ?? null;
  const systemTemplate = (attributes.systemTemplate as string) ?? null;

  // Message.boardId is a FK with onDelete:SetNull. If the attribute
  // references a non-existent board (stale webhook, test placeholder,
  // race with board creation), drop the link rather than failing the
  // insert — the message kind + attributes remain intact.
  let boardId: string | null = null;
  if (rawBoardId) {
    const board = await prisma.board.findUnique({
      where: { id: rawBoardId },
      select: { id: true },
    });
    boardId = board?.id ?? null;
  }

  // Idempotency: skip if we already have this Twilio message
  const existing = await prisma.message.findUnique({
    where: { twilioMessageSid: event.MessageSid },
    select: { id: true },
  });
  if (existing) return;

  await prisma.message.create({
    data: {
      sessionId: session.id,
      userId,
      kind,
      text: event.Body || null,
      mediaUrl,
      mediaS3Key,
      boardId,
      singleItemInventoryProductId,
      singleItemWebUrl,
      systemTemplate,
      twilioMessageSid: event.MessageSid,
      createdAt: event.DateCreated ? new Date(event.DateCreated) : undefined,
    },
  });

  // TODO: dispatch push notification to offline recipient (Wave 5)
}
