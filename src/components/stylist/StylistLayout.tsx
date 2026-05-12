"use client";

import { StylistTopBar } from "@/components/nav/stylist-top-bar";

interface StylistLayoutProps {
  children: React.ReactNode;
  stylistInitials?: string;
}

// Stylist chrome matches /stylist/dashboard: the StylistTopBar across the
// top (Wishi | Stylist logo · calendar · bell · settings · My bookings ·
// avatar) and no left sidebar. The dashboard top-bar already covers the
// nav items the old sidebar duplicated.
export function StylistLayout({
  children,
  stylistInitials = "ST",
}: StylistLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <StylistTopBar stylistInitials={stylistInitials} />
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}
