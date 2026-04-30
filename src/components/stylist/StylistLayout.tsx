"use client";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { StylistSidebar } from "./StylistSidebar";
import { NotificationsPopover } from "./NotificationsPopover";

interface StylistLayoutProps {
  children: React.ReactNode;
}

export function StylistLayout({ children }: StylistLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <StylistSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-14 flex items-center justify-between border-b border-border px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shrink-0">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <NotificationsPopover />
          </header>
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
