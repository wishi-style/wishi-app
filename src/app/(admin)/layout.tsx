import { requireRole } from "@/lib/auth";
import { AdminSidebar } from "@/components/nav/admin-sidebar";
import { ImpersonationBanner } from "@/components/admin/impersonation-banner";
import { getServerAuth } from "@/lib/auth/server-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("ADMIN");
  const { sessionClaims } = await getServerAuth();
  const act = (sessionClaims as { act?: { sub?: string } } | undefined)?.act;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        {act?.sub ? <ImpersonationBanner /> : null}
        <main className="flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
