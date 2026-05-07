import { prisma } from "@/lib/prisma";
import { twilioClient, getTwilioConfig } from "@/lib/twilio";
import { SystemTemplate } from "./system-templates";
import { sendSystemMessage } from "./send-message";

/**
 * Creates (or recovers) the Twilio Conversation backing a session's chat.
 *
 * Idempotent + recoverable from any partial-failure state:
 *   1. Look up by uniqueName (`session-<id>`) — reuses an orphaned conversation
 *      from a prior crash instead of 50027-conflicting on a fresh create.
 *   2. List participants and only add missing identities — avoids the 50433
 *      "participant already exists" duplicate.
 *   3. Persist `Session.twilioChannelSid` before the welcome send, since
 *      `sendSystemMessage` re-reads it via `getConversationSid`.
 *   4. Welcome is best-effort and only fires on a fresh create; recovered
 *      conversations skip it to avoid a duplicate WELCOME card.
 *
 * Rollback: if we *just* created the Twilio conversation in this call and
 * a later step fails, we delete it before throwing so the next call can
 * cleanly retry.
 */
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

  if (session.twilioChannelSid) return session.twilioChannelSid;

  if (!session.stylist?.clerkId || !session.client.clerkId) {
    throw new Error("Both client and stylist must have clerkIds for chat");
  }

  const { conversationsServiceSid } = getTwilioConfig();
  const uniqueName = `session-${sessionId}`;

  let conversationSid: string | null = null;
  let createdNewConversation = false;

  try {
    const existing = await twilioClient.conversations.v1
      .services(conversationsServiceSid)
      .conversations(uniqueName)
      .fetch();
    conversationSid = existing.sid;
  } catch (err) {
    const e = err as { status?: number };
    if (e.status !== 404) throw err;
  }

  if (!conversationSid) {
    const created = await twilioClient.conversations.v1
      .services(conversationsServiceSid)
      .conversations.create({
        friendlyName: `Session ${sessionId}`,
        uniqueName,
      });
    conversationSid = created.sid;
    createdNewConversation = true;
  }

  const rollbackTwilio = async () => {
    if (!createdNewConversation || !conversationSid) return;
    await twilioClient.conversations.v1
      .services(conversationsServiceSid)
      .conversations(conversationSid)
      .remove()
      .catch(() => {});
  };

  try {
    const participants = await twilioClient.conversations.v1
      .services(conversationsServiceSid)
      .conversations(conversationSid)
      .participants.list();
    const present = new Set(
      participants.map((p) => p.identity).filter((id): id is string => !!id),
    );
    const toAdd = [session.client.clerkId, session.stylist.clerkId].filter(
      (id) => !present.has(id),
    );
    await Promise.all(
      toAdd.map((identity) =>
        twilioClient.conversations.v1
          .services(conversationsServiceSid)
          .conversations(conversationSid!)
          .participants.create({ identity }),
      ),
    );
  } catch (err) {
    await rollbackTwilio();
    throw err;
  }

  try {
    await prisma.session.update({
      where: { id: sessionId },
      data: { twilioChannelSid: conversationSid },
    });
  } catch (err) {
    await rollbackTwilio();
    throw err;
  }

  if (createdNewConversation) {
    try {
      await sendSystemMessage(sessionId, SystemTemplate.WELCOME, {
        clientFirstName: session.client.firstName ?? "there",
        planType: session.planType,
        stylistFirstName: session.stylist.firstName ?? "your stylist",
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "welcome_send_failed",
          sessionId,
          conversationSid,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  } else {
    console.warn(
      JSON.stringify({
        event: "chat_conversation_recovered",
        sessionId,
        conversationSid,
      }),
    );
  }

  return conversationSid;
}
