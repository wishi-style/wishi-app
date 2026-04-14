import { requireRole } from "@/lib/auth";
import { StylistNav } from "@/components/nav/stylist-nav";

export default async function StylistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("STYLIST", "ADMIN");

  return (
    <div className="flex min-h-screen flex-col">
      <StylistNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
