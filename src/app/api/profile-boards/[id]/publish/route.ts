// POST /api/profile-boards/[id]/publish
//
// Sessionless profile-board publish path used by Method 2 (sessionless
// creators on /stylist/profile/boards/new/{moodboard,styleboard}). Flips
// isFeaturedOnProfile=true after validating minimum content + style label.
// No chat send, no notifications.

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import {
  publishProfileBoard,
  type PublishStyleboardItem,
} from "@/lib/boards/profile-boards.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("STYLIST");
    const user = await getCurrentAuthUser();
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const { id } = await context.params;
    const body = (await req.json().catch(() => ({}))) as {
      profileStyle?: string;
      coverUrl?: string | null;
      title?: string | null;
      description?: string | null;
      tags?: string[];
      // Styleboard variant: canvas snapshot from the LookCreator. The
      // service replaces existing BoardItem rows in the same tx that flips
      // isFeaturedOnProfile. Moodboards don't send this (photos live in
      // BoardPhoto and are persisted incrementally via /photos).
      items?: PublishStyleboardItem[];
    };

    const board = await publishProfileBoard({
      stylistUserId: user.id,
      boardId: id,
      profileStyle: body.profileStyle,
      coverUrl: body.coverUrl ?? null,
      title: body.title ?? null,
      description: body.description ?? null,
      tags: body.tags ?? [],
      items: body.items,
    });
    return NextResponse.json({ board });
  } catch (err) {
    if (err instanceof Response) return err;
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[profile-boards/publish] failed", err);
    return NextResponse.json({ error: "Publish failed" }, { status: 500 });
  }
}
