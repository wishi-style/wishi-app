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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-14">
        <header className="mb-8">
          <h1 className="font-display text-3xl md:text-4xl">Closet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything you own, everything you love. Build collections and cross-reference looks.
          </p>
        </header>
        <ClosetPageClient
          initialItems={items}
          looks={looks}
          collections={collections}
        />
      </div>
    </div>
  );
}
