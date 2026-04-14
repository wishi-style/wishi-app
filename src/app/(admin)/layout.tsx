import { requireRole } from "@/lib/auth";
import { AdminNav } from "@/components/nav/admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");

  return (
    <div className="flex min-h-screen flex-col">
      <AdminNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
