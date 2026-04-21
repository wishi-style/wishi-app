import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit/log";

export async function createUserNote({
  userId,
  authorId,
  content,
}: {
  userId: string;
  authorId: string;
  content: string;
}) {
  const note = await prisma.userNote.create({
    data: { userId, authorId, content },
  });
  await writeAudit({
    actorUserId: authorId,
    action: "user.note_added",
    entityType: "UserNote",
    entityId: note.id,
    meta: { userId, contentPreview: content.slice(0, 80) },
  });
  return note;
}
