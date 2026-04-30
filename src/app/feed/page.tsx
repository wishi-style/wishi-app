import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { listFeedBoards, type FeedGender } from "@/lib/feed/feed.service";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { FeedList } from "./feed-list";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stylist Looks — Wishi",
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
  const gender: FeedGender = sp.gender === "MEN" ? "MEN" : "WOMEN";

  const user = await getCurrentUser();
  const firstPage = await listFeedBoards({
    gender,
    limit: 24,
    userId: user?.id ?? null,
  });

  return (
    <>
      <SiteHeader />
      <div className="min-h-screen bg-background">
        {/* Header — Loveable Feed.tsx:84-104. Centered "Stylist Looks" title +
            pill-toggle directly underneath. No descriptive subtitle. */}
        <section className="container max-w-4xl pt-8 md:pt-14 pb-6 md:pb-8 px-4">
          <div className="flex flex-col items-center gap-4 md:gap-5">
            <h1 className="font-display text-2xl md:text-4xl text-center">
              Stylist Looks
            </h1>
            <div className="flex items-center gap-1">
              {tabs.map((tab) => (
                <Link
                  key={tab.value}
                  href={`/feed?gender=${tab.value}`}
                  className={cn(
                    "font-body text-sm px-5 py-2 rounded-full transition-colors",
                    gender === tab.value
                      ? "bg-foreground text-background font-medium"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="container max-w-4xl pb-20 px-4">
          <FeedList
            initialPage={firstPage}
            gender={gender}
            isAuthed={!!user}
          />
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
