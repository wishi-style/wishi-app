"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function MyStyleSessionsLink() {
  const pathname = usePathname();
  const active =
    pathname === "/sessions" ||
    pathname.startsWith("/sessions/") ||
    pathname.startsWith("/session/");

  return (
    <Link
      href="/sessions"
      className={cn(
        "hidden md:inline-flex text-sm tracking-wide rounded-full px-3 py-1.5 transition-colors",
        active ? "bg-secondary/40 font-medium" : "hover:bg-secondary/50",
      )}
    >
      My Style Sessions
    </Link>
  );
}
