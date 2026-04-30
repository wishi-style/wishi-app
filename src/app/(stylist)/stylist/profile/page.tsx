import { requireRole } from "@/lib/auth";
import StylistProfile from "./profile-client";

export const dynamic = "force-dynamic";

export default async function StylistProfilePage() {
  await requireRole("STYLIST");
  return <StylistProfile />;
}
