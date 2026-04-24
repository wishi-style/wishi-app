import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notFound, forbidden, unauthorized } from "next/navigation";
import { listClosetItems } from "@/lib/boards/closet.service";
import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { StyleboardViewer } from "@/app/(client)/sessions/[id]/styleboards/[boardId]/viewer";

export const dynamic = "force-dynamic";

// Stylist read-only view of a styleboard — mirrors the client viewer page so
// the chat bubble "Open" action works for the stylist who sent the board.
// The `(stylist)` route-group layout already gates on requireRole("STYLIST", "ADMIN").
export default async function StylistStyleboardPage({
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
  if (!board.session || board.session.stylistId !== user.id) {
    forbidden();
  }

  const [closetItems, inspiration] = await Promise.all([
    listClosetItems({ userId: board.session.clientId }),
    listInspirationPhotos({ take: 200 }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold">
        {board.isRevision ? "Revised Look" : "Styleboard"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        This is what your client sees.
      </p>
      <StyleboardViewer
        boardId={board.id}
        items={board.items}
        rating={board.rating}
        canRate={false}
        closetItems={closetItems}
        inspiration={inspiration}
        pendingDueAt={null}
      />
    </div>
  );
}
