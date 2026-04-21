// GET + POST /api/stylist/profile/boards
//
// GET  → list the signed-in stylist's profile boards, optionally filtered by ?style=
// POST → create a new profile board for a given style. Body: { profileStyle }

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { createProfileBoard, listProfileBoards } from "@/lib/boards/profile-boards.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const style = new URL(req.url).searchParams.get("style");
    const boards = await listProfileBoards(user.id, style);
    return NextResponse.json({ boards });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[profile-boards/list] failed", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const body = await req.json();
    const profileStyle = String(body.profileStyle ?? "").trim();
    if (!profileStyle) {
      return NextResponse.json({ error: "profileStyle required" }, { status: 400 });
    }

    const board = await createProfileBoard({
      stylistUserId: user.id,
      profileStyle,
    });
    return NextResponse.json({ board }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[profile-boards/create] failed", err);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
