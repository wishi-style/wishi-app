import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateStyleboard, type RateStyleboardInput } from "@/lib/boards/styleboard.service";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as RateStyleboardInput;
  if (
    body?.rating !== "LOVE" &&
    body?.rating !== "REVISE" &&
    body?.rating !== "NOT_MY_STYLE"
  ) {
    return NextResponse.json(
      { error: "rating must be LOVE, REVISE, or NOT_MY_STYLE" },
      { status: 400 },
    );
  }
  try {
    const result = await rateStyleboard(id, body, user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
