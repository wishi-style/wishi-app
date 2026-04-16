import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { forbidden, notFound } from "next/navigation";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { MoodboardBuilder } from "./builder";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewMoodboardPage({ params }: Props) {
  await requireRole("STYLIST");
  const { id: sessionId } = await params;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, stylistId: true },
  });
  if (!session) notFound();

  const inspiration = await listInspirationPhotos({ take: 60 });

  // Reuse an existing unsent moodboard for this session if present, else create.
  let board = await prisma.board.findFirst({
    where: {
      sessionId,
      type: "MOODBOARD",
      sentAt: null,
    },
    include: { photos: { orderBy: { orderIndex: "asc" } } },
  });
  if (!board) {
    const created = await prisma.board.create({
      data: {
        type: "MOODBOARD",
        sessionId,
        stylistProfileId: (
          await prisma.stylistProfile.findUniqueOrThrow({
            where: { userId: session.stylistId ?? "" },
            select: { id: true },
          })
        ).id,
      },
    });
    board = { ...created, photos: [] };
  }

  if (!board) forbidden();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Build a Moodboard</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Pick 6–10 photos that capture the direction for this client.
      </p>
      <MoodboardBuilder
        boardId={board.id}
        sessionId={sessionId}
        initialPhotos={board.photos}
        inspiration={inspiration}
      />
    </div>
  );
}
