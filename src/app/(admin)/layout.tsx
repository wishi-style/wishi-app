import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/nav/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
