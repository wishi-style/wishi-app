import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approveEnd, SessionTransitionError } from "@/lib/sessions/transitions";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const session = await prisma.session.findUnique({
    where: { id },
    select: { clientId: true },
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (session.clientId !== user.id) {
    return NextResponse.json({ error: "Only the client can approve" }, { status: 403 });
  }
  try {
    const updated = await approveEnd(id);
    return NextResponse.json(updated);
  } catch (e) {
    const status = e instanceof SessionTransitionError ? 409 : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status },
    );
  }
}
