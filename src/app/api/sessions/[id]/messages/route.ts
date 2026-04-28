import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTextMessage, sendSingleItemMessage } from "@/lib/chat/send-message";

export const dynamic = "force-dynamic";

// Read-side message list + send-side composer for the stylist Dashboard
// right-rail preview. The full chat experience (real-time subscriptions,
// media, boards, suggested replies) still lives in /workspace.

async function authorize(sessionId: string, userId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      clientId: true,
      stylistId: true,
      twilioChannelSid: true,
    },
  });
  if (!session) return { error: "Not found" as const, status: 404 };
  if (session.clientId !== userId && session.stylistId !== userId) {
    return { error: "Forbidden" as const, status: 403 };
  }
  return { session };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const auth = await authorize(id, user.id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const messages = await prisma.message.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      text: true,
      mediaUrl: true,
      kind: true,
      userId: true,
      createdAt: true,
    },
  });
  messages.reverse();

  return NextResponse.json({
    messages: messages.map((m) => ({
      id: m.id,
      text: m.text,
      mediaUrl: m.mediaUrl,
      kind: m.kind,
      sender:
        m.userId === auth.session.stylistId
          ? "stylist"
          : m.userId === auth.session.clientId
            ? "client"
            : "system",
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.clerkId) {
    return NextResponse.json({ error: "No clerk id" }, { status: 400 });
  }
  const { id } = await params;
  const auth = await authorize(id, user.id);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!auth.session.twilioChannelSid) {
    return NextResponse.json(
      { error: "No chat channel for this session" },
      { status: 400 },
    );
  }
  const payload = (await req.json().catch(() => ({}))) as {
    kind?: "TEXT" | "SINGLE_ITEM";
    body?: string;
    webUrl?: string;
    inventoryProductId?: string;
  };
  const kind = payload.kind ?? "TEXT";
  const text = (payload.body ?? "").trim();

  try {
    if (kind === "SINGLE_ITEM") {
      // Stylist-only: SINGLE_ITEM message kind is the dashboard's "Item
      // Recommendation" path. Clients can only send TEXT through this
      // endpoint — they shop, stylists recommend.
      if (user.role !== "STYLIST") {
        return NextResponse.json(
          { error: "Only stylists can send item recommendations" },
          { status: 403 },
        );
      }
      const webUrl = payload.webUrl?.trim();
      const inventoryProductId = payload.inventoryProductId?.trim();
      if (!webUrl && !inventoryProductId) {
        return NextResponse.json(
          { error: "SINGLE_ITEM requires webUrl or inventoryProductId" },
          { status: 400 },
        );
      }
      if (webUrl) {
        try {
          new URL(webUrl);
        } catch {
          return NextResponse.json({ error: "Invalid webUrl" }, { status: 400 });
        }
      }
      await sendSingleItemMessage(id, {
        authorClerkId: user.clerkId,
        webUrl,
        inventoryProductId,
        body: text || undefined,
      });
      return NextResponse.json({ ok: true });
    }

    if (!text) return NextResponse.json({ error: "Empty" }, { status: 400 });
    await sendTextMessage(id, { authorClerkId: user.clerkId, body: text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Send failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
