import { prisma } from "@/lib/prisma";
import { twilioClient, getTwilioConfig } from "@/lib/twilio";
import { SystemTemplate, renderSystemTemplate } from "./system-templates";

export async function createChatConversation(sessionId: string): Promise<string> {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: {
      id: true,
      planType: true,
      twilioChannelSid: true,
      client: { select: { id: true, clerkId: true, firstName: true } },
      stylist: { select: { id: true, clerkId: true, firstName: true } },
    },
  });

  if (session.twilioChannelSid) {
    return session.twilioChannelSid;
  }

  if (!session.stylist?.clerkId || !session.client.clerkId) {
    throw new Error("Both client and stylist must have clerkIds for chat");
  }

  const { conversationsServiceSid } = getTwilioConfig();

  const conversation = await twilioClient.conversations.v1
    .services(conversationsServiceSid)
    .conversations.create({
      friendlyName: `Session ${sessionId}`,
      uniqueName: `session-${sessionId}`,
    });

  await Promise.all([
    twilioClient.conversations.v1
      .services(conversationsServiceSid)
      .conversations(conversation.sid)
      .participants.create({ identity: session.client.clerkId }),
    twilioClient.conversations.v1
      .services(conversationsServiceSid)
      .conversations(conversation.sid)
      .participants.create({ identity: session.stylist.clerkId }),
  ]);

  await prisma.session.update({
    where: { id: sessionId },
    data: { twilioChannelSid: conversation.sid },
  });

  // Send welcome system message
  const welcomeText = renderSystemTemplate(SystemTemplate.WELCOME, {
    clientFirstName: session.client.firstName ?? "there",
    planType: session.planType,
    stylistFirstName: session.stylist.firstName ?? "your stylist",
  });

  await twilioClient.conversations.v1
    .services(conversationsServiceSid)
    .conversations(conversation.sid)
    .messages.create({
      author: "system",
      body: welcomeText,
      attributes: JSON.stringify({
        kind: "SYSTEM_AUTOMATED",
        systemTemplate: SystemTemplate.WELCOME,
      }),
      // Tell Twilio to fire post-event webhooks for this server-sent message
      // so handleMessageAdded persists it to our Message table. Without this,
      // REST-API messages bypass the webhook to prevent loops.
      xTwilioWebhookEnabled: "true",
    });

  return conversation.sid;
}
