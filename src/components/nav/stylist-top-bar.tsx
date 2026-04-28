"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Calendar, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  stylistInitials: string;
}

export function StylistTopBar({ stylistInitials }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const onBookings = pathname?.startsWith("/stylist/bookings");

  return (
    <header className="h-14 flex items-center justify-between border-b border-border px-4 md:px-6 bg-background shrink-0">
      <Link href="/stylist/dashboard" className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-foreground flex items-center justify-center">
          <span className="font-display text-xs font-semibold">W</span>
        </div>
        <span className="font-display text-sm font-semibold hidden sm:inline">
          Wishi
        </span>
        <span className="text-muted-foreground hidden sm:inline">|</span>
        <span className="font-body text-sm text-muted-foreground hidden sm:inline">
          Stylist
        </span>
      </Link>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Calendar"
          className="text-muted-foreground hover:text-foreground"
        >
          <Calendar className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          className="text-muted-foreground hover:text-foreground relative"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Settings"
          onClick={() => router.push("/stylist/settings")}
          className="text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-5 w-5" />
        </Button>
        <button
          type="button"
          onClick={() => router.push("/stylist/bookings")}
          className={cn(
            "ml-1 px-3 py-2 font-body text-sm transition-colors hover:text-foreground",
            onBookings ? "text-foreground font-medium" : "text-muted-foreground",
          )}
        >
          My bookings
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                aria-label="Open profile menu"
                className="ml-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarFallback className="bg-accent text-accent-foreground font-body text-xs">
                {stylistInitials}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 font-body">
            <DropdownMenuItem onClick={() => router.push("/stylist/profile")}>
              My Profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => router.push("/stylist/dressing-room")}
            >
              My Dressing Room
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/stylist/settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/logout")}>
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
