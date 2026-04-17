"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Sparkles,
  MessagesSquare,
  CreditCard,
  Package,
  ImageIcon,
  Shirt,
  ListChecks,
  ScrollText,
} from "lucide-react";

const sections: Array<{
  heading: string;
  links: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }> }>;
}> = [
  {
    heading: "Overview",
    links: [{ href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    heading: "People",
    links: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/stylists", label: "Stylists", icon: Sparkles },
    ],
  },
  {
    heading: "Workflow",
    links: [
      { href: "/admin/sessions", label: "Sessions", icon: MessagesSquare },
      { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { href: "/admin/orders", label: "Orders", icon: Package },
    ],
  },
  {
    heading: "Content",
    links: [
      { href: "/admin/inspiration-photos", label: "Inspiration", icon: ImageIcon },
      { href: "/admin/looks", label: "Looks", icon: Shirt },
      { href: "/admin/quiz-builder", label: "Quiz Builder", icon: ListChecks },
    ],
  },
  {
    heading: "Platform",
    links: [{ href: "/admin/audit-log", label: "Audit Log", icon: ScrollText }],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-muted/20">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Link href="/admin/dashboard" className="flex items-center gap-1.5">
          <span className="text-lg font-semibold tracking-tight">Wishi</span>
          <span className="text-xs font-normal text-muted-foreground">Admin</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm">
        {sections.map((section) => (
          <div key={section.heading} className="mb-4">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.heading}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.links.map((link) => {
                const Icon = link.icon;
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 font-medium transition-colors",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-3">
        <UserButton />
      </div>
    </aside>
  );
}
