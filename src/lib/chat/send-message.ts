import { prisma } from "@/lib/prisma";
import { twilioClient, getTwilioConfig } from "@/lib/twilio";
import { SystemTemplate, renderSystemTemplate } from "./system-templates";
import type { MessageKind } from "@/generated/prisma/client";

async function getConversationSid(sessionId: string): Promise<string> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { twilioChannelSid: true },
  });
  if (!session.twilioChannelSid) {
    throw new Error(`Session ${sessionId} has no Twilio conversation`);
  }
  return session.twilioChannelSid;
}

/**
 * Write a Twilio message via REST with xTwilioWebhookEnabled so our
 * /api/webhooks/twilio handler persists it to the Message table.
 */
async function sendTwilioMessage(
  conversationSid: string,
  options: { author: string; body: string; attributes: Record<string, unknown> },
): Promise<void> {
  const { conversationsServiceSid } = getTwilioConfig();
  await twilioClient.conversations.v1
    .services(conversationsServiceSid)
    .conversations(conversationSid)
    .messages.create({
      author: options.author,
      body: options.body,
      attributes: JSON.stringify(options.attributes),
      xTwilioWebhookEnabled: "true",
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
  await sendTwilioMessage(conversationSid, {
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
  await sendTwilioMessage(conversationSid, {
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
  await sendTwilioMessage(conversationSid, {
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
  await sendTwilioMessage(conversationSid, {
    author: options.authorClerkId,
    body: options.body ?? "",
    attributes: {
      kind: "SINGLE_ITEM",
      singleItemInventoryProductId: options.inventoryProductId,
      singleItemWebUrl: options.webUrl,
    },
  });
}
