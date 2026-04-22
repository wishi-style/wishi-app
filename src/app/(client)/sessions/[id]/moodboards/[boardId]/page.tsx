import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound, forbidden, unauthorized } from "next/navigation";
import { MoodboardViewer } from "./viewer";

export const dynamic = "force-dynamic";

export default async function MoodboardPage({
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
      photos: { orderBy: { orderIndex: "asc" } },
      session: {
        select: { id: true, clientId: true, stylistId: true },
        include: undefined,
      },
    },
  });
  if (!board || board.type !== "MOODBOARD" || board.sessionId !== sessionId) {
    notFound();
  }
  if (
    !board.session ||
    (board.session.clientId !== user.id && board.session.stylistId !== user.id)
  ) {
    forbidden();
  }

  const isClient = board.session.clientId === user.id;

  // Surface the OPEN PENDING_CLIENT_FEEDBACK action on the client view so they
  // see a "respond by" deadline while they rate the board. Filtering on type
  // ensures the chip reflects the client's own response window and never
  // leaks a stylist-facing action (e.g. PENDING_RESTYLE also carries boardId).
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
      <h1 className="mb-2 text-2xl font-semibold">Your Moodboard</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {isClient
          ? "Take a look and let your stylist know what you think."
          : "This is what your client sees."}
      </p>
      <MoodboardViewer
        boardId={board.id}
        photos={board.photos}
        rating={board.rating}
        canRate={isClient && board.rating == null}
        pendingDueAt={pendingAction?.dueAt ?? null}
      />
    </div>
  );
}
