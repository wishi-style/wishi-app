"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Pricing", href: "/pricing" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Lux Package", href: "/lux" },
  { label: "Stylists", href: "/stylists" },
  { label: "Feed", href: "/feed" },
] as const;

export function SiteHeaderMobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const sessionsActive =
    pathname === "/sessions" ||
    pathname.startsWith("/sessions/") ||
    pathname.startsWith("/session/");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="md:hidden -ml-1 rounded-md p-1.5 transition-colors hover:bg-secondary/50"
        >
          <MenuIcon className="h-5 w-5 text-foreground" />
          <span className="sr-only">Open menu</span>
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 pt-12">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <nav className="flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-lg px-4 py-3 text-sm tracking-wide transition-colors",
                pathname === link.href
                  ? "bg-secondary font-medium"
                  : "hover:bg-secondary/50",
              )}
            >
              {link.label}
            </Link>
          ))}
          {signedIn && (
            <Link
              href="/sessions"
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-lg px-4 py-3 text-sm tracking-wide transition-colors",
                sessionsActive
                  ? "bg-secondary font-medium"
                  : "hover:bg-secondary/50",
              )}
            >
              My Style Sessions
            </Link>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
