import { unauthorized } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listClosetItems } from "@/lib/boards/closet.service";
import { listFavoriteBoards } from "@/lib/boards/favorite.service";
import { listCollections } from "@/lib/collections/collection.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LoyaltyTier } from "@/generated/prisma/client";
import { ProfilePageClient } from "./client";

export const dynamic = "force-dynamic";

const LOYALTY_LABEL: Record<LoyaltyTier, string> = {
  BRONZE: "Bronze Member",
  GOLD: "Gold Member",
  PLATINUM: "Platinum Member",
};

function initialsFor(firstName: string, lastName: string): string {
  const f = firstName?.trim()?.[0] ?? "";
  const l = lastName?.trim()?.[0] ?? "";
  return `${f}${l}`.toUpperCase() || "?";
}

export default async function ProfilePage() {
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

  const displayName = `${user.firstName}'s Closet`;
  const initials = initialsFor(user.firstName, user.lastName);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-14">
        <header className="mb-8 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {user.avatarUrl ? (
              <AvatarImage src={user.avatarUrl} alt={user.firstName} />
            ) : null}
            <AvatarFallback className="bg-primary text-primary-foreground font-display text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-2xl md:text-3xl">{displayName}</h1>
            <p className="mt-0.5 font-body text-xs uppercase tracking-widest text-muted-foreground">
              {LOYALTY_LABEL[user.loyaltyTier]}
            </p>
          </div>
        </header>
        <ProfilePageClient
          initialItems={items}
          looks={looks}
          collections={collections}
        />
      </div>
    </div>
  );
}
