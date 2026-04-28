"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";

const links = [
  { href: "/sessions", label: "Sessions" },
  { href: "/profile", label: "Profile" },
  { href: "/orders", label: "Orders" },
  { href: "/settings", label: "Settings" },
];

export function ClientNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-background">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-semibold tracking-tight">
            Wishi
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <UserButton />
      </nav>
    </header>
  );
}
