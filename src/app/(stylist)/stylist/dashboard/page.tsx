import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { getStylistDashboardData } from "@/lib/sessions/stylist-dashboard";
import StylistDashboard from "./dashboard-client";

export const dynamic = "force-dynamic";

function initialsFor(firstName: string | null, lastName: string | null): string {
  const f = firstName?.trim()?.[0] ?? "";
  const l = lastName?.trim()?.[0] ?? "";
  return `${f}${l}`.toUpperCase() || "?";
}

export default async function StylistDashboardPage() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const sessions = await getStylistDashboardData(user.id);
  const stylistInitials = initialsFor(user.firstName, user.lastName);

  return <StylistDashboard sessions={sessions} stylistInitials={stylistInitials} />;
}
