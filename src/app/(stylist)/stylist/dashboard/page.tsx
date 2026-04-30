import { requireRole } from "@/lib/auth";
import StylistDashboard from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function StylistDashboardPage() {
  await requireRole("STYLIST");
  return <StylistDashboard />;
}
