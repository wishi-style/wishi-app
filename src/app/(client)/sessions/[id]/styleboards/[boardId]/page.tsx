import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound, forbidden, unauthorized } from "next/navigation";
import { listClosetItems } from "@/lib/boards/closet.service";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { StyleboardViewer } from "./viewer";

export const dynamic = "force-dynamic";

export default async function StyleboardPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  const { id: sessionId, boardId } = await params;

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      items: { orderBy: { orderIndex: "asc" } },
      session: { select: { id: true, clientId: true, stylistId: true } },
    },
  });
  if (!board || board.type !== "STYLEBOARD" || board.sessionId !== sessionId) {
    notFound();
  }
  if (
    !board.session ||
    (board.session.clientId !== user.id && board.session.stylistId !== user.id)
  ) {
    forbidden();
  }

  const [closetItems, inspiration] = await Promise.all([
    listClosetItems({ userId: board.session.clientId }),
    listInspirationPhotos({ take: 200 }),
  ]);

  const isClient = board.session.clientId === user.id;

  // Filter on PENDING_CLIENT_FEEDBACK only — PENDING_RESTYLE is also keyed by
  // boardId but addresses the stylist, so it must never surface on the
  // client viewer's chip.
  const pendingAction =
    isClient && board.rating == null
      ? await prisma.sessionPendingAction.findFirst({
          where: {
            sessionId,
            boardId: board.id,
            type: "PENDING_CLIENT_FEEDBACK",
            status: "OPEN",
          },
          orderBy: { dueAt: "asc" },
          select: { dueAt: true },
        })
      : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold">
        {board.isRevision ? "Revised Look" : "Your Styleboard"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {isClient
          ? "Take a look and react. Pick items to revise if something isn't quite right."
          : "This is what your client sees."}
      </p>
      <StyleboardViewer
        boardId={board.id}
        items={board.items}
        rating={board.rating}
        canRate={isClient && board.rating == null}
        closetItems={closetItems}
        inspiration={inspiration}
        pendingDueAt={pendingAction?.dueAt ?? null}
      />
    </div>
  );
}
