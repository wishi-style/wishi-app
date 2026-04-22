import type { Metadata } from "next";
import Link from "next/link";
import { listFeedBoards, type FeedGender } from "@/lib/feed/feed.service";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { FeedList } from "./feed-list";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Feed — Wishi",
  description:
    "Looks curated by our stylists — tap a card to see who styled it and start a session.",
};

interface Props {
  searchParams: Promise<{ gender?: string }>;
}

const tabs: { label: string; value: FeedGender }[] = [
  { label: "Womenswear", value: "WOMEN" },
  { label: "Menswear", value: "MEN" },
];

export default async function FeedPage({ searchParams }: Props) {
  const sp = await searchParams;
  const gender: FeedGender =
    sp.gender === "MEN" ? "MEN" : "WOMEN";

  const firstPage = await listFeedBoards({ gender, limit: 24 });

  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-background">
        <section className="border-b border-border">
          <div className="mx-auto max-w-6xl px-6 md:px-10 py-10 md:py-14">
            <h1 className="font-display text-3xl md:text-4xl mb-2">Feed</h1>
            <p className="text-sm text-muted-foreground">
              Real looks our stylists have put together. Tap a card to see who styled it.
            </p>
            <nav
              className="mt-6 inline-flex rounded-full border border-border p-1 text-sm"
              aria-label="Feed category"
            >
              {tabs.map((tab) => (
                <Link
                  key={tab.value}
                  href={`/feed?gender=${tab.value}`}
                  className={cn(
                    "rounded-full px-4 py-1.5 transition-colors",
                    gender === tab.value
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
          </div>
        </section>

        <section className="py-10 md:py-14">
          <div className="mx-auto max-w-6xl px-6 md:px-10">
            <FeedList initialPage={firstPage} gender={gender} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
