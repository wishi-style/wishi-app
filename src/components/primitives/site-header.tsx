import Link from "next/link";
import Image from "next/image";
import { auth } from "@clerk/nextjs/server";
import { ShoppingBagIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { SiteHeaderNav } from "./site-header-nav";
import { SiteHeaderMobileMenu } from "./site-header-mobile-menu";
import { SiteHeaderUserMenu } from "./site-header-user-menu";
import { MyStyleSessionsLink } from "./site-header-my-sessions-link";

async function getCartCountForClerkUser(clerkId: string): Promise<number> {
  try {
    const user = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!user) return 0;
    return await prisma.cartItem.count({ where: { userId: user.id } });
  } catch {
    return 0;
  }
}

export async function SiteHeader() {
  const { userId } = await auth();
  const signedIn = userId !== null && userId !== undefined;
  const cartCount = signedIn ? await getCartCountForClerkUser(userId) : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto max-w-6xl flex h-16 items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-4 md:gap-8">
          <SiteHeaderMobileMenu signedIn={signedIn} />
          <Link
            href="/"
            aria-label="Wishi home"
            className="flex items-center"
          >
            <Image
              src="/img/logo.png"
              alt=""
              width={181}
              height={136}
              className="h-8 w-auto"
              priority
            />
          </Link>
          <SiteHeaderNav />
        </div>
        <div className="flex items-center gap-4">
          {signedIn ? (
            <>
              <MyStyleSessionsLink />
              <Link
                href="/cart"
                aria-label="Cart"
                className="relative inline-flex items-center justify-center"
              >
                <ShoppingBagIcon className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-warm-beige text-[10px] font-medium text-dark-taupe">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </Link>
              <SiteHeaderUserMenu />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-full px-3 py-1.5 text-sm tracking-wide transition-colors hover:bg-secondary/50"
              >
                Sign in
              </Link>
              <Link
                href="/match-quiz"
                className="inline-flex h-9 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
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
