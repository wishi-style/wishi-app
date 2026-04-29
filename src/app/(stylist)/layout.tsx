import { requireRole } from "@/lib/auth";

export default async function StylistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("STYLIST");

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">{children}</main>
    </div>
  );
}
