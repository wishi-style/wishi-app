import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getPrivateNote,
  stylistHasWorkedWithClient,
  upsertPrivateNote,
} from "@/lib/stylists/private-notes";

export const dynamic = "force-dynamic";

async function authorize(clientId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 };
  if (user.role !== "STYLIST" && !user.isAdmin) {
    return { error: "Forbidden" as const, status: 403 };
  }
  const worked = await stylistHasWorkedWithClient(user.id, clientId);
  if (!worked) return { error: "Forbidden" as const, status: 403 };
  return { stylistUserId: user.id };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const auth = await authorize(clientId);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const note = await getPrivateNote(auth.stylistUserId, clientId);
  return NextResponse.json({
    body: note?.body ?? "",
    updatedAt: note?.updatedAt?.toISOString() ?? null,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  const auth = await authorize(clientId);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const note = await upsertPrivateNote(
    auth.stylistUserId,
    clientId,
    body.body ?? "",
  );
  return NextResponse.json({
    body: note.body,
    updatedAt: note.updatedAt.toISOString(),
  });
}
