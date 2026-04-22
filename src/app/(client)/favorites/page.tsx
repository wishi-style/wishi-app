import { unauthorized } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { listFavoriteStylists } from "@/lib/stylists/favorite-stylist.service";
import { listFavoriteBoards, listFavoriteItems } from "@/lib/boards/favorite.service";
import { FavoritesTabsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const [stylists, boards, items] = await Promise.all([
    listFavoriteStylists(user.id),
    listFavoriteBoards(user.id),
    listFavoriteItems(user.id),
  ]);

  // Profile boards (no session) and moodboards aren't user-facing "Looks";
  // keep this tab limited to session styleboards so the link target is real.
  const looks = boards.filter(
    (fav) => fav.board.type === "STYLEBOARD" && fav.board.sessionId,
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-8 font-serif text-3xl text-stone-900">Favorites</h1>
      <Tabs defaultValue="looks" className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="looks">Looks ({looks.length})</TabsTrigger>
          <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="stylists">Stylists ({stylists.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="looks">
          {looks.length === 0 ? (
            <EmptyState
              title="No favorite looks yet"
              body="Save styleboards from your styling sessions to see them here."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {looks.map((fav) => (
                <Link
                  key={fav.id}
                  href={`/sessions/${fav.board.sessionId}`}
                  className="group block overflow-hidden rounded-xl border border-stone-200"
                >
                  <div className="aspect-[3/4] bg-stone-100" />
                  <div className="p-3 text-xs text-stone-600">
                    {fav.board.title ?? "Styleboard"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="items">
          {items.length === 0 ? (
            <EmptyState
              title="No favorite items yet"
              body="Tap the heart on a product to save it here."
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-stone-200"
                >
                  {item.webItemImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.webItemImageUrl}
                      alt={item.webItemTitle ?? "favorite item"}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center bg-stone-100 text-xs text-stone-400">
                      {item.webItemBrand ?? "Item"}
                    </div>
                  )}
                  <div className="p-3">
                    <p className="truncate text-xs font-medium text-stone-800">
                      {item.webItemBrand ?? ""}
                    </p>
                    <p className="truncate text-xs text-stone-500">
                      {item.webItemTitle ?? ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stylists">
          {stylists.length === 0 ? (
            <EmptyState
              title="No favorite stylists yet"
              body={
                <>
                  Browse{" "}
                  <Link href="/stylists" className="underline">
                    our stylists
                  </Link>{" "}
                  and tap the heart to save your favorites.
                </>
              }
            />
          ) : (
            <FavoritesTabsClient stylists={stylists} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="py-20 text-center">
      <p className="mb-2 font-serif text-xl text-stone-800">{title}</p>
      <p className="text-sm text-stone-500">{body}</p>
    </div>
  );
}
