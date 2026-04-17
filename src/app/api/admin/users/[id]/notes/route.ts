import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createUserNote } from "@/lib/users/notes.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = (await req.json()) as { content?: string };
  const content = body.content?.trim();
  if (!content) {
    return NextResponse.json({ error: "content required" }, { status: 400 });
  }
  const note = await createUserNote({
    userId: id,
    authorId: admin.userId,
    content,
  });
  return NextResponse.json(note, { status: 201 });
}
