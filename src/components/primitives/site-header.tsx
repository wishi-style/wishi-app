import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { ShoppingBagIcon } from "lucide-react";
import { SiteHeaderNav } from "./site-header-nav";

export async function SiteHeader() {
  const { userId } = await auth();
  const signedIn = userId !== null && userId !== undefined;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-display text-2xl tracking-[0.08em] leading-none"
            aria-label="Wishi home"
          >
            Wishi
          </Link>
          <SiteHeaderNav />
        </div>
        <div className="flex items-center gap-4">
          {signedIn ? (
            <>
              <Link
                href="/sessions"
                className="hidden md:inline-flex text-sm tracking-wide px-3 py-1.5 rounded-full hover:bg-secondary/50 transition-colors"
              >
                My Style Sessions
              </Link>
              <Link
                href="/cart"
                aria-label="Cart"
                className="relative inline-flex items-center justify-center"
              >
                <ShoppingBagIcon className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
              </Link>
              <UserButton
                appearance={{ elements: { avatarBox: "h-8 w-8" } }}
              />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-sm tracking-wide px-3 py-1.5 rounded-full hover:bg-secondary/50 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/match-quiz"
                className="inline-flex h-9 items-center rounded-full bg-foreground text-background px-5 text-sm font-medium hover:bg-foreground/90 transition-colors"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
