import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { getStylistDashboardData } from "@/lib/sessions/stylist-dashboard";
import StylistDashboard from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function StylistDashboardPage() {
  await requireRole("STYLIST", "ADMIN");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const sessions = await getStylistDashboardData(user.id);

  return <StylistDashboard sessions={sessions} />;
}
