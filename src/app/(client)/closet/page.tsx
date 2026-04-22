import { unauthorized } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listClosetItems } from "@/lib/boards/closet.service";
import { listFavoriteBoards } from "@/lib/boards/favorite.service";
import { listCollections } from "@/lib/collections/collection.service";
import { ClosetPageClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ClosetPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const [items, favoriteBoards, collections] = await Promise.all([
    listClosetItems({ userId: user.id }),
    listFavoriteBoards(user.id),
    listCollections(user.id),
  ]);

  // Surface only styleboards in the Looks tab — moodboards aren't user-facing
  // saved looks. Map to a serializable shape.
  const looks = favoriteBoards
    .filter((fb) => fb.board.type === "STYLEBOARD")
    .map((fb) => ({
      id: fb.id,
      boardId: fb.board.id,
      sessionId: fb.board.sessionId,
      title: fb.board.title,
    }));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <ClosetPageClient
        initialItems={items}
        looks={looks}
        collections={collections}
      />
    </div>
  );
}
