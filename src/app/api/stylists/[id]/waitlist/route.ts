import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: stylistProfileId } = await params;

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const stylist = await prisma.stylistProfile.findUnique({
    where: { id: stylistProfileId },
    select: { id: true, isAvailable: true },
  });
  if (!stylist) {
    return NextResponse.json({ error: "Stylist not found" }, { status: 404 });
  }

  if (stylist.isAvailable) {
    return NextResponse.json(
      { error: "Stylist is available — book directly instead" },
      { status: 400 }
    );
  }

  const entry = await prisma.stylistWaitlistEntry.upsert({
    where: {
      userId_stylistProfileId: {
        userId: user.id,
        stylistProfileId,
      },
    },
    update: {
      status: "PENDING",
      cancelledAt: null,
    },
    create: {
      userId: user.id,
      stylistProfileId,
      status: "PENDING",
    },
  });

  return NextResponse.json({ waitlistEntry: entry }, { status: 201 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId: clerkId } = await getServerAuth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: stylistProfileId } = await params;

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.stylistWaitlistEntry.updateMany({
    where: {
      userId: user.id,
      stylistProfileId,
      status: "PENDING",
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
