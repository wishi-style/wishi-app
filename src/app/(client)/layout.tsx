import { requireRole } from "@/lib/auth";
import { ClientNav } from "@/components/nav/client-nav";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("CLIENT");

  return (
    <div className="flex min-h-screen flex-col">
      <ClientNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
