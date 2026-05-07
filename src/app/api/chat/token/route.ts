import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { getTwilioConfig } from "@/lib/twilio";
import Twilio from "twilio";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true, clerkId: true },
  });
  if (!user?.clerkId) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // If sessionId provided, verify the user is a participant. We intentionally
  // do NOT block on missing `twilioChannelSid` — `useChat` already degrades
  // gracefully (DB-bootstrap fallback) and `getConversationSid` self-heals
  // on send. A token grants access to the Conversations Service, not a
  // specific conversation, so handing it out is safe.
  if (sessionId) {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { clientId: true, stylistId: true },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.clientId !== user.id && session.stylistId !== user.id) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }
  }

  const { accountSid, apiKeySid, apiKeySecret, conversationsServiceSid } =
    getTwilioConfig();

  const token = new Twilio.jwt.AccessToken(
    accountSid,
    apiKeySid,
    apiKeySecret,
    { identity: user.clerkId, ttl: 3600 },
  );

  token.addGrant(
    new Twilio.jwt.AccessToken.ChatGrant({
      serviceSid: conversationsServiceSid,
    }),
  );

  return NextResponse.json({
    token: token.toJwt(),
    identity: user.clerkId,
  });
}
