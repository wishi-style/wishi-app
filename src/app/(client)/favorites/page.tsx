import { unauthorized } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
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

  const looks = boards.filter(
    (fav: (typeof boards)[number]) =>
      fav.board.type === "STYLEBOARD" && fav.board.sessionId,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 md:px-10 py-10 md:py-14">
        <h1 className="mb-8 font-display text-3xl md:text-4xl">Favorites</h1>
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
                {looks.map((fav: (typeof looks)[number]) => (
                  <Link
                    key={fav.id}
                    href={`/sessions/${fav.board.sessionId}`}
                    className="group block overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
                  >
                    <div className="aspect-[3/4] bg-muted" />
                    <div className="p-3 text-xs text-muted-foreground">
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
                {items.map((item: (typeof items)[number]) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-border bg-card"
                  >
                    {item.webItemImageUrl ? (
                      <Image
                        src={item.webItemImageUrl}
                        alt={item.webItemTitle ?? "favorite item"}
                        width={400}
                        height={400}
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className="aspect-square w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
                        {item.webItemBrand ?? "Item"}
                      </div>
                    )}
                    <div className="p-3">
                      <p className="truncate text-xs font-medium text-foreground">
                        {item.webItemBrand ?? ""}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.webItemTitle ?? ""}
                      </p>
                    </div>
                  </article>
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
                    <Link href="/stylists" className="underline underline-offset-4">
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
      <p className="mb-2 font-display text-xl text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
