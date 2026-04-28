import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { StylistTopBar } from "@/components/nav/stylist-top-bar";

function initialsFor(firstName: string | null, lastName: string | null): string {
  const f = firstName?.trim()?.[0] ?? "";
  const l = lastName?.trim()?.[0] ?? "";
  return `${f}${l}`.toUpperCase() || "?";
}

export default async function StylistChromeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentAuthUser();
  const stylistInitials = initialsFor(
    user?.firstName ?? null,
    user?.lastName ?? null,
  );

  return (
    <>
      <StylistTopBar stylistInitials={stylistInitials} />
      {children}
    </>
  );
}
