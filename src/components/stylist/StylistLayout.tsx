"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { StylistTopBar } from "@/components/nav/stylist-top-bar";
import { StylistSidebar } from "./StylistSidebar";

interface StylistLayoutProps {
  children: React.ReactNode;
  stylistInitials?: string;
}

// Stylist chrome: StylistTopBar across the top (Wishi | Stylist logo ·
// calendar · bell · settings · My bookings · avatar) AND the left sidebar
// (Queue · Profile · Availability · Settings). Matches the dashboard's
// header but keeps the persistent sidebar for in-page navigation.
export function StylistLayout({
  children,
  stylistInitials = "ST",
}: StylistLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <StylistTopBar stylistInitials={stylistInitials} />
      <SidebarProvider>
        <div className="flex w-full flex-1 min-h-0">
          <StylistSidebar />
          <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
        </div>
      </SidebarProvider>
    </div>
  );
}
