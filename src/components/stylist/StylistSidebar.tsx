"use client";

import { LayoutDashboardIcon, CalendarIcon, UserIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";

// In-page nav for /stylist/* surfaces. The logo + user avatar are
// owned by StylistTopBar (top of page) so the sidebar deliberately
// renders neither. Settings + bookings live in the top bar; this rail
// only carries the section nav stylists move between.
const mainNav = [
  { title: "Queue", url: "/stylist/dashboard", icon: LayoutDashboardIcon },
  { title: "Profile", url: "/stylist/profile", icon: UserIcon },
  { title: "Availability", url: "/availability", icon: CalendarIcon },
];

export function StylistSidebar() {
  return (
    <Sidebar collapsible="none" className="border-r border-sidebar-border">
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
                      <span className="font-body text-sm">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
