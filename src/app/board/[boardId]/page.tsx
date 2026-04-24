import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ boardId: string }>;
}

/**
 * Public, un-authed view of a STYLEBOARD that a stylist has sent. Access
 * is open-by-default per founder decision 2026-04-24 — anyone with the
 * URL can view the board + stylist attribution + items + "book this
 * stylist" CTA.
 *
 * Draft boards (sentAt is null) 404 here — they're still in-progress
 * and shouldn't leak through a copied link. Moodboards + restyle boards
 * are also out of scope for the public view (only the finalized
 * STYLEBOARD that the client received).
 */
async function loadSharedBoard(boardId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      photos: { orderBy: { orderIndex: "asc" } },
      items: { orderBy: { orderIndex: "asc" } },
      session: {
        select: {
          stylist: {
            select: {
              firstName: true,
              lastName: true,
              avatarUrl: true,
              stylistProfile: { select: { id: true, isAvailable: true } },
            },
          },
        },
      },
    },
  });

  if (!board) return null;
  if (board.type !== "STYLEBOARD") return null;
  if (!board.sentAt) return null;
  // Restyle/revision boards wrap an original STYLEBOARD and aren't meant
  // to be shared publicly — the canonical share URL is the parent board.
  if (board.isRevision) return null;
  if (!board.session?.stylist) return null;
  if (!board.session.stylist.stylistProfile) return null;
  return board;
}

// Shared boards are public-by-link, not public-by-discovery — unfurls +
// social previews are wanted, but search-engine indexing of per-client
// styleboards is not. Override the root layout's `robots.index = true`.
const SHARED_BOARD_ROBOTS = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { boardId } = await params;
  const board = await loadSharedBoard(boardId);
  if (!board) {
    return { title: "Styleboard — Wishi", robots: SHARED_BOARD_ROBOTS };
  }

  const stylist = board.session?.stylist;
  const stylistName = stylist
    ? `${stylist.firstName} ${stylist.lastName}`.trim()
    : "a Wishi stylist";
  const title = board.title ?? "Styleboard";
  const description =
    board.stylistNote ?? `A styleboard curated by ${stylistName} on Wishi.`;
  const cover = board.photos[0]?.url;
  return {
    title: `${title} — styled by ${stylistName}`,
    description: description.slice(0, 200),
    robots: SHARED_BOARD_ROBOTS,
    openGraph: {
      title: `${title} — styled by ${stylistName}`,
      description: description.slice(0, 200),
      url: `/board/${boardId}`,
      type: "article",
      ...(cover ? { images: [{ url: cover, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} — styled by ${stylistName}`,
      description: description.slice(0, 200),
      ...(cover ? { images: [cover] } : {}),
    },
    alternates: { canonical: `/board/${boardId}` },
  };
}

export default async function SharedBoardPage({ params }: Props) {
  const { boardId } = await params;
  const board = await loadSharedBoard(boardId);
  if (!board) notFound();

  const stylist = board.session!.stylist!;
  const stylistProfileId = stylist.stylistProfile!.id;
  const stylistName = `${stylist.firstName} ${stylist.lastName}`.trim();
  const firstName = stylist.firstName || "your stylist";
  const initials =
    `${stylist.firstName?.[0] ?? ""}${stylist.lastName?.[0] ?? ""}`.toUpperCase() ||
    firstName.charAt(0);

  const title = board.title ?? "Styleboard";
  const photos = board.photos;
  const items = board.items;

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
          {/* Stylist attribution */}
          <div className="mb-8 flex items-center gap-3">
            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-muted">
              {stylist.avatarUrl ? (
                <Image
                  src={stylist.avatarUrl}
                  alt={stylistName}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
                  {initials}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                styled by
              </p>
              <Link
                href={`/stylists/${stylistProfileId}`}
                className="font-display text-lg underline-offset-4 hover:underline"
              >
                {stylistName}
              </Link>
            </div>
          </div>

          {/* Board title + note */}
          <header className="mb-8">
            <h1 className="mb-3 font-display text-3xl md:text-4xl">{title}</h1>
            {board.stylistNote && (
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {board.stylistNote}
              </p>
            )}
          </header>

          {/* Photos grid */}
          {photos.length > 0 && (
            <section className="mb-10">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="overflow-hidden rounded-xl bg-muted"
                  >
                    <Image
                      src={photo.url}
                      alt={title}
                      width={600}
                      height={600}
                      sizes="(min-width: 768px) 33vw, 50vw"
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Items */}
          {items.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Shop the look
              </h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {items.map((item) => {
                  const label =
                    item.webItemTitle ??
                    (item.source === "INVENTORY" ? "Featured piece" : "Item");
                  const brand = item.webItemBrand ?? null;
                  const img = item.webItemImageUrl ?? null;
                  return (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-xl border border-border bg-card"
                    >
                      {img ? (
                        <Image
                          src={img}
                          alt={label}
                          width={400}
                          height={400}
                          sizes="(min-width: 768px) 25vw, 50vw"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square items-center justify-center p-2 text-center text-xs text-muted-foreground">
                          {label}
                        </div>
                      )}
                      <div className="p-3">
                        {brand && (
                          <p className="truncate text-xs uppercase tracking-widest text-dark-taupe">
                            {brand}
                          </p>
                        )}
                        <p className="truncate text-sm">{label}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* CTA to book this stylist */}
          <section className="mt-14 border-t border-border pt-10 text-center">
            <div className="mb-4 flex items-center justify-center gap-3">
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                {stylist.avatarUrl ? (
                  <Image
                    src={stylist.avatarUrl}
                    alt={stylistName}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-medium text-muted-foreground">
                    {initials}
                  </div>
                )}
              </div>
              <div className="text-left">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  styled by
                </p>
                <p className="font-display text-lg">{stylistName}</p>
              </div>
            </div>
            <h2 className="mb-3 font-display text-2xl md:text-3xl">
              Want {firstName} to style you?
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
              Book a session and get personalized looks curated just for you.
            </p>
            <Link
              href={`/stylists/${stylistProfileId}`}
              className="inline-flex h-11 items-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Continue with {firstName}
            </Link>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
