import { requireRole } from "@/lib/auth";
import { SiteHeader } from "@/components/primitives/site-header";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("CLIENT");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
