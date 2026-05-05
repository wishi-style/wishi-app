import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { getStylistDashboardData } from "@/lib/sessions/stylist-dashboard";
import StylistDashboard from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function StylistDashboardPage() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) return null;

  const sessions = await getStylistDashboardData(user.id);
  // DashboardSession (service) uses nullable fields;
  // DashboardSessionRow (client) uses optional. Coerce.
  const initialSessions = sessions.map((s) => ({
    ...s,
    endedAt: s.endedAt ?? undefined,
    endRequestedAt: s.endRequestedAt ?? undefined,
  }));

  return <StylistDashboard initialSessions={initialSessions} />;
}
