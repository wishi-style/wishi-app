import { prisma } from "@/lib/prisma";
import { twilioClient, getTwilioConfig } from "@/lib/twilio";
import { createChatConversation } from "./create-conversation";
import { SystemTemplate, renderSystemTemplate } from "./system-templates";
import type { MessageKind } from "@/generated/prisma/client";

// Self-heal: if `Session.twilioChannelSid` is null (createChatConversation
// failed mid-flight at match time — partial Twilio outage, transient
// participant-add error), backfill it on demand instead of throwing the
// caller into a half-state. Idempotent: createChatConversation early-returns
// when the SID is already set.
async function getConversationSid(sessionId: string): Promise<string> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { twilioChannelSid: true },
  });
  if (session.twilioChannelSid) return session.twilioChannelSid;

  console.warn(
    `[send-message] Session ${sessionId} has no Twilio conversation — attempting self-heal via createChatConversation`,
  );
  return createChatConversation(sessionId);
}

interface SendTwilioMessageOptions {
  author: string;
  body: string;
  attributes: {
    kind: MessageKind;
    boardId?: string;
    mediaUrl?: string;
    mediaS3Key?: string;
    singleItemInventoryProductId?: string;
    singleItemWebUrl?: string;
    systemTemplate?: string;
  };
}

/**
 * Write a Twilio message via REST with xTwilioWebhookEnabled so our
 * /api/webhooks/twilio handler persists it to the Message table — AND mirror
 * the same message into the Message table inline. Two-phase write protects
 * the chat from webhook delivery failure: the inline insert keys on Twilio's
 * MessageSid (which is `@unique`), so the webhook's idempotent
 * `findUnique-then-skip` short-circuits the duplicate.
 *
 * The chat's DB-bootstrap path (`/api/sessions/[id]/messages`) reads from the
 * Message table, so the inline write is what makes the moodboard / styleboard
 * card appear in the right pane even when Twilio's post-event webhook fails
 * to find the session (orphaned conversations from a partial
 * `createChatConversation`, signature mismatch, network drop, etc.).
 */
async function sendTwilioMessage(
  sessionId: string,
  conversationSid: string,
  options: SendTwilioMessageOptions,
): Promise<void> {
  const { conversationsServiceSid } = getTwilioConfig();
  const twilioMsg = await twilioClient.conversations.v1
    .services(conversationsServiceSid)
    .conversations(conversationSid)
    .messages.create({
      author: options.author,
      body: options.body,
      attributes: JSON.stringify(options.attributes),
      xTwilioWebhookEnabled: "true",
    });

  await mirrorTwilioMessageToDb({
    sessionId,
    authorClerkId: options.author === "system" ? null : options.author,
    body: options.body,
    twilioMessageSid: twilioMsg.sid,
    attributes: options.attributes,
  });
}

// Inline mirror of a sent Twilio message into the Message table. Mirrors the
// shape of `handleMessageAdded` in chat/webhook-handlers.ts so the webhook
// races us harmlessly via `Message.twilioMessageSid @unique`. Failures here
// are logged but never thrown — Twilio already accepted the message, so the
// realtime delivery succeeded; the only consequence of a failed mirror is
// the chat's DB-bootstrap path missing this message until the webhook lands.
async function mirrorTwilioMessageToDb(input: {
  sessionId: string;
  authorClerkId: string | null;
  body: string;
  twilioMessageSid: string;
  attributes: SendTwilioMessageOptions["attributes"];
}): Promise<void> {
  try {
    let userId: string | null = null;
    if (input.authorClerkId) {
      const user = await prisma.user.findUnique({
        where: { clerkId: input.authorClerkId },
        select: { id: true },
      });
      userId = user?.id ?? null;
    }

    let boardId: string | null = null;
    if (input.attributes.boardId) {
      const board = await prisma.board.findUnique({
        where: { id: input.attributes.boardId },
        select: { id: true },
      });
      boardId = board?.id ?? null;
    }

    await prisma.message.create({
      data: {
        sessionId: input.sessionId,
        userId,
        kind: input.attributes.kind,
        text: input.body || null,
        mediaUrl: input.attributes.mediaUrl ?? null,
        mediaS3Key: input.attributes.mediaS3Key ?? null,
        boardId,
        singleItemInventoryProductId: input.attributes.singleItemInventoryProductId ?? null,
        singleItemWebUrl: input.attributes.singleItemWebUrl ?? null,
        systemTemplate: input.attributes.systemTemplate ?? null,
        twilioMessageSid: input.twilioMessageSid,
      },
    });
  } catch (err) {
    // P2002 on twilioMessageSid means the webhook beat us to it — that's
    // exactly the idempotency we want; not a real failure.
    const e = err as { code?: string };
    if (e.code === "P2002") return;
    console.error(
      JSON.stringify({
        event: "mirror_twilio_message_failed",
        sessionId: input.sessionId,
        twilioMessageSid: input.twilioMessageSid,
        kind: input.attributes.kind,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/**
 * Send a plain TEXT message on behalf of a user. Used by the Dashboard
 * right-rail composer and any other server-side text-send surfaces.
 */
export async function sendTextMessage(
  sessionId: string,
  options: { authorClerkId: string; body: string },
): Promise<void> {
  const body = options.body.trim();
  if (!body) throw new Error("Empty message");
  const conversationSid = await getConversationSid(sessionId);
  await sendTwilioMessage(sessionId, conversationSid, {
    author: options.authorClerkId,
    body,
    attributes: { kind: "TEXT" satisfies MessageKind },
  });
}

/**
 * Send a SYSTEM_AUTOMATED chat message using a named template.
 */
export async function sendSystemMessage(
  sessionId: string,
  template: SystemTemplate,
  vars: Record<string, string> = {},
): Promise<void> {
  const conversationSid = await getConversationSid(sessionId);
  const body = renderSystemTemplate(template, vars);
  await sendTwilioMessage(sessionId, conversationSid, {
    author: "system",
    body,
    attributes: { kind: "SYSTEM_AUTOMATED", systemTemplate: template },
  });
}

export interface SendBoardMessageOptions {
  authorClerkId: string;
  kind: Extract<MessageKind, "MOODBOARD" | "STYLEBOARD" | "RESTYLE">;
  boardId: string;
  body?: string;
}

/**
 * Send a chat message carrying a board reference (moodboard/styleboard/restyle).
 */
export async function sendBoardMessage(
  sessionId: string,
  options: SendBoardMessageOptions,
): Promise<void> {
  const conversationSid = await getConversationSid(sessionId);
  await sendTwilioMessage(sessionId, conversationSid, {
    author: options.authorClerkId,
    body: options.body ?? "",
    attributes: { kind: options.kind, boardId: options.boardId },
  });
}

/**
 * Send the special END_SESSION_REQUEST chat card. Uses "system" author so
 * both participants see it and the card isn't mis-attributed to the stylist.
 */
export async function sendEndSessionRequestMessage(
  sessionId: string,
  requesterFirstName: string,
): Promise<void> {
  const conversationSid = await getConversationSid(sessionId);
  const body = renderSystemTemplate(SystemTemplate.END_SESSION_REQUESTED, {
    requesterFirstName,
  });
  await sendTwilioMessage(sessionId, conversationSid, {
    author: "system",
    body,
    attributes: {
      kind: "END_SESSION_REQUEST",
      systemTemplate: SystemTemplate.END_SESSION_REQUESTED,
    },
  });
}

export interface SendSingleItemOptions {
  authorClerkId: string;
  inventoryProductId?: string;
  webUrl?: string;
  body?: string;
}

export async function sendSingleItemMessage(
  sessionId: string,
  options: SendSingleItemOptions,
): Promise<void> {
  if (!options.inventoryProductId && !options.webUrl) {
    throw new Error("sendSingleItemMessage requires inventoryProductId or webUrl");
  }
  const conversationSid = await getConversationSid(sessionId);
  await sendTwilioMessage(sessionId, conversationSid, {
    author: options.authorClerkId,
    body: options.body ?? "",
    attributes: {
      kind: "SINGLE_ITEM",
      singleItemInventoryProductId: options.inventoryProductId,
      singleItemWebUrl: options.webUrl,
    },
  });
}
