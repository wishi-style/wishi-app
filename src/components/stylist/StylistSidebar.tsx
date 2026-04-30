"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboardIcon, CalendarIcon, SettingsIcon, LogOutIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";

const mainNav = [
  { title: "Queue", url: "/stylist/dashboard", icon: LayoutDashboardIcon },
  { title: "Profile", url: "/stylist/profile", icon: UserIcon },
  { title: "Availability", url: "/availability", icon: CalendarIcon },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

export function StylistSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="p-4 border-b border-sidebar-border">
        <Link href="/stylist/dashboard" className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-full border-2 border-foreground flex items-center justify-center">
            <span className="font-display text-sm font-semibold">W</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display text-sm font-semibold leading-tight">Wishi</span>
              <span className="text-[10px] font-body text-muted-foreground tracking-wide">Stylist</span>
            </div>
          )}
        </Link>
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-body text-[10px] tracking-widest text-muted-foreground uppercase">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      href={item.url}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span className="font-body text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-accent text-accent-foreground font-body text-xs">
              SM
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-body text-sm font-medium truncate">Sarah M.</p>
              <p className="font-body text-[10px] text-muted-foreground">Pro Stylist</p>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
