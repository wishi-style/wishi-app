import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveClientProfileView } from "@/lib/stylists/client-profile";
import { stylistHasWorkedWithClient } from "@/lib/stylists/private-notes";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "STYLIST" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { clientId } = await params;
  const worked = await stylistHasWorkedWithClient(user.id, clientId);
  if (!worked && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await resolveClientProfileView(clientId, user.id);
  if (!profile) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ profile });
}
