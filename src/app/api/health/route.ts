import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return Response.json({ ok: true, db: "up" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ ok: false, db: "down", error: message }, { status: 503 });
  }
}
