"use client";

import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

export function PublicNav() {
  return (
    <header className="border-b border-border bg-background">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          Wishi
        </Link>

        <div className="flex items-center gap-6">
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
          <Link
            href="/stylists"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Stylists
          </Link>

          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
            </Link>
          </Show>

          <Show when="signed-in">
            <Link
              href="/sessions"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Sessions
            </Link>
            <UserButton />
          </Show>
        </div>
      </nav>
    </header>
  );
}
