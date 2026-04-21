import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { resume } from "@/lib/stylists/onboarding";

export const dynamic = "force-dynamic";

// /onboarding — entry point. Redirects to the stylist's current step.
export default async function OnboardingEntry() {
  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");
  const { step, status } = await resume(user.id);
  if (status === "AWAITING_ELIGIBILITY" || status === "ELIGIBLE") {
    redirect("/stylist/dashboard");
  }
  redirect(`/onboarding/step-${step}`);
}
