"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BellIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navLinks = [
  { label: "Dashboard", href: "/stylist" },
  { label: "Settings", href: "/stylist/settings" },
];

export function StylistHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/stylist" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-full border-2 border-foreground flex items-center justify-center">
              <span className="font-display text-sm font-semibold">W</span>
            </div>
            <span className="font-display text-sm font-medium tracking-wide text-muted-foreground">Stylist</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm font-body tracking-wide transition-colors hover:text-foreground",
                  pathname === link.href
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <button className="relative">
            <BellIcon className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
            <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-body">
              3
            </span>
          </button>
          <Link
            href="/stylist/bookings"
            className={cn(
              "text-sm font-body tracking-wide transition-colors hover:text-foreground",
              pathname === "/stylist/bookings"
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            My bookings
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Avatar className="h-8 w-8 cursor-pointer">
                <AvatarFallback className="bg-accent text-accent-foreground font-body text-xs">
                  SM
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 font-body">
              <DropdownMenuItem asChild>
                <Link href="/stylist/profile">My Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/stylist/dressing-room">My Dressing Room</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/stylist/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/logout">Logout</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
