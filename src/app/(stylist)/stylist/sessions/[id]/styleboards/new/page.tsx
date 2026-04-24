import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { listClosetItems } from "@/lib/boards/closet.service";
import { StyleboardBuilder } from "./builder";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ parentBoardId?: string; boardId?: string }>;
}

export default async function NewStyleboardPage({ params, searchParams }: Props) {
  await requireRole("STYLIST");
  const { id: sessionId } = await params;
  const { parentBoardId, boardId: existingBoardId } = await searchParams;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      clientId: true,
      stylistId: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
  if (!session) notFound();

  let board = existingBoardId
    ? await prisma.board.findUnique({
        where: { id: existingBoardId },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      })
    : await prisma.board.findFirst({
        where: {
          sessionId,
          type: "STYLEBOARD",
          sentAt: null,
          ...(parentBoardId ? { parentBoardId } : { parentBoardId: null }),
        },
        include: { items: { orderBy: { orderIndex: "asc" } } },
      });

  if (!board) {
    const stylistProfile = await prisma.stylistProfile.findUniqueOrThrow({
      where: { userId: session.stylistId ?? "" },
      select: { id: true },
    });
    const created = await prisma.board.create({
      data: {
        type: "STYLEBOARD",
        sessionId,
        stylistProfileId: stylistProfile.id,
        parentBoardId: parentBoardId ?? null,
        isRevision: !!parentBoardId,
      },
    });
    board = { ...created, items: [] };
  }

  const [closetItems, inspiration] = await Promise.all([
    listClosetItems({ userId: session.clientId }),
    listInspirationPhotos({ take: 60 }),
  ]);

  const clientName =
    [session.client.firstName, session.client.lastName]
      .filter(Boolean)
      .join(" ") || "Client";

  return (
    <StyleboardBuilder
      boardId={board.id}
      sessionId={sessionId}
      isRevision={board.isRevision}
      clientId={session.clientId}
      clientName={clientName}
      initialItems={board.items}
      closetItems={closetItems}
      inspiration={inspiration}
    />
  );
}
