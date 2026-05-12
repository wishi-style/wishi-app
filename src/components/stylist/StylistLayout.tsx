"use client";

import { SidebarProvider } from "@/components/ui/sidebar";
import { StylistSidebar } from "./StylistSidebar";

interface StylistLayoutProps {
  children: React.ReactNode;
}

// Wishi site header is rendered above this layout by the page itself
// (server-component composition); the NotificationsPopover lives inside
// the SiteHeader via its `extras` slot. The slim sticky stylist sub-header
// + collapse trigger were removed per founder feedback.
export function StylistLayout({ children }: StylistLayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex w-full flex-1">
        <StylistSidebar />
        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
