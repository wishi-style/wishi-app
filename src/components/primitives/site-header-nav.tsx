"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Pricing", href: "/pricing" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Lux Package", href: "/lux" },
  { label: "Stylists", href: "/stylists" },
  { label: "Feed", href: "/feed" },
] as const;

export function SiteHeaderNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden md:flex items-center gap-2">
      {navLinks.map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "text-sm tracking-wide px-3 py-1.5 rounded-full transition-colors",
              active
                ? "bg-secondary font-medium"
                : "hover:bg-secondary/50",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
