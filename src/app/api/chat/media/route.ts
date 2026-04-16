import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { getChatMediaPresignedUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const filename = url.searchParams.get("filename");
  const contentType = url.searchParams.get("contentType");

  if (!sessionId || !filename || !contentType) {
    return NextResponse.json(
      { error: "sessionId, filename, and contentType are required" },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

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

  const result = await getChatMediaPresignedUrl(sessionId, filename, contentType);

  return NextResponse.json(result);
}
