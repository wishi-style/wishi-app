import { prisma } from "@/lib/prisma";

// Stylist-authored private notes. One note per (stylist, client); the stylist
// edits in place. Never visible to the client. Access is gated by a prior
// Session row between the two users — the route enforces it.

export interface PrivateNote {
  id: string;
  stylistUserId: string;
  clientUserId: string;
  body: string;
  updatedAt: Date;
}

export async function getPrivateNote(
  stylistUserId: string,
  clientUserId: string,
): Promise<PrivateNote | null> {
  const row = await prisma.stylistPrivateNote.findUnique({
    where: {
      stylistUserId_clientUserId: { stylistUserId, clientUserId },
    },
  });
  return row;
}

export async function upsertPrivateNote(
  stylistUserId: string,
  clientUserId: string,
  body: string,
): Promise<PrivateNote> {
  const trimmed = body.trim();
  if (!trimmed) {
    // Empty body = delete. Matches stylist UX where clearing the textarea
    // and saving should remove the note.
    await prisma.stylistPrivateNote.deleteMany({
      where: { stylistUserId, clientUserId },
    });
    return {
      id: "",
      stylistUserId,
      clientUserId,
      body: "",
      updatedAt: new Date(),
    };
  }
  return prisma.stylistPrivateNote.upsert({
    where: {
      stylistUserId_clientUserId: { stylistUserId, clientUserId },
    },
    create: { stylistUserId, clientUserId, body: trimmed },
    update: { body: trimmed },
  });
}

export async function stylistHasWorkedWithClient(
  stylistUserId: string,
  clientUserId: string,
): Promise<boolean> {
  const count = await prisma.session.count({
    where: { stylistId: stylistUserId, clientId: clientUserId },
  });
  return count > 0;
}
