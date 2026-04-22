import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  favoriteStylist,
  listFavoriteStylists,
} from "@/lib/stylists/favorite-stylist.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stylists = await listFavoriteStylists(user.id);
  return NextResponse.json({ stylists });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as { stylistProfileId?: string };
  if (!body.stylistProfileId) {
    return NextResponse.json(
      { error: "stylistProfileId required" },
      { status: 400 },
    );
  }
  const fav = await favoriteStylist(user.id, body.stylistProfileId);
  return NextResponse.json(fav, { status: 201 });
}
