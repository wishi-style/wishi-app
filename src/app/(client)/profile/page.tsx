import Link from "next/link";
import { unauthorized } from "next/navigation";
import { MoreVerticalIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listClosetItems } from "@/lib/boards/closet.service";
import { listDeliveredStyleboardsForClient } from "@/lib/profile/delivered-styleboards.service";
import { listStyledInventoryItemsForUser } from "@/lib/profile/styled-items.service";
import { getProduct } from "@/lib/inventory/inventory-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { LoyaltyTier } from "@/generated/prisma/client";
import { ProfilePageClient, type ShopItem, type Look } from "./client";

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

  const [closetItems, deliveredLooks, styledIds] = await Promise.all([
    listClosetItems({ userId: user.id }),
    listDeliveredStyleboardsForClient(user.id),
    listStyledInventoryItemsForUser(user.id),
  ]);

  // Resolve inventory DTOs in parallel — getProduct is 5-min cached so a
  // repeat profile load is essentially free.
  const productDocs = await Promise.all(
    styledIds.map((s) => getProduct(s.inventoryProductId)),
  );
  const shopItems: ShopItem[] = styledIds.flatMap((styled, i) => {
    const doc = productDocs[i];
    if (!doc) return [];
    return [
      {
        inventoryProductId: styled.inventoryProductId,
        sourceBoardId: styled.sourceBoardId,
        title: doc.canonical_name ?? null,
        designer: doc.brand_name ?? null,
        priceDollars: Number.isFinite(doc.min_price)
          ? Math.round(doc.min_price)
          : null,
        imageUrl: doc.primary_image_url ?? doc.image_urls?.[0] ?? null,
        productUrl: doc.listings?.[0]?.product_url ?? null,
        category: doc.category_slug ?? null,
        colors: doc.color_families ?? doc.available_colors ?? [],
      },
    ];
  });

  const looks: Look[] = deliveredLooks.map((l) => ({
    boardId: l.boardId,
    sessionId: l.sessionId,
    title: l.title,
    thumbnailUrl: l.thumbnailUrl,
    stylistName: `${l.stylistFirstName} ${l.stylistLastName}`.trim(),
    sentAt: l.sentAt.toISOString(),
  }));

  // "In N Outfits" carousel inside ClosetItemDialog. For each closet item,
  // collect the styleboards it appears on (boardItems → board) and pick
  // the first available thumbnail.
  const closetIds = closetItems.map((c) => c.id);
  const outfitsByItemId: Record<
    string,
    { id: string; title: string; image: string | null }[]
  > = {};
  if (closetIds.length > 0) {
    const itemBoardLinks = await prisma.boardItem.findMany({
      where: {
        closetItemId: { in: closetIds },
        board: { type: "STYLEBOARD", sentAt: { not: null } },
      },
      select: {
        closetItemId: true,
        board: {
          select: {
            id: true,
            title: true,
            photos: {
              orderBy: { orderIndex: "asc" },
              take: 1,
              select: { url: true },
            },
            items: {
              where: { webItemImageUrl: { not: null } },
              orderBy: { orderIndex: "asc" },
              take: 1,
              select: { webItemImageUrl: true },
            },
          },
        },
      },
    });
    for (const link of itemBoardLinks) {
      if (!link.closetItemId || !link.board) continue;
      const list = outfitsByItemId[link.closetItemId] ?? [];
      if (list.some((o) => o.id === link.board.id)) continue;
      const image =
        link.board.photos[0]?.url ?? link.board.items[0]?.webItemImageUrl ?? null;
      list.push({
        id: link.board.id,
        title: link.board.title ?? "Look",
        image,
      });
      outfitsByItemId[link.closetItemId] = list;
    }
  }

  const displayName = `${user.firstName}'s Closet`;
  const initials = initialsFor(user.firstName, user.lastName);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-14">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.firstName} />
              ) : null}
              <AvatarFallback className="bg-primary text-primary-foreground font-display text-xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-display text-2xl md:text-3xl">
                {displayName}
              </h1>
              <p className="mt-0.5 font-body text-xs uppercase tracking-widest text-muted-foreground">
                {LOYALTY_LABEL[user.loyaltyTier]}
              </p>
            </div>
          </div>
          <Link
            href="/settings"
            aria-label="Settings"
            className="rounded-full p-2 transition-colors hover:bg-muted"
          >
            <MoreVerticalIcon className="h-5 w-5 text-muted-foreground" />
          </Link>
        </header>
        <ProfilePageClient
          initialItems={closetItems}
          shopItems={shopItems}
          looks={looks}
          outfitsByItemId={outfitsByItemId}
        />
      </div>
    </div>
  );
}
