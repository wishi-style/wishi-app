import { redirect } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { resume } from "@/lib/stylists/onboarding";

export const dynamic = "force-dynamic";

// `/onboarding` is shared by two audiences:
//   • Stylists mid-wizard — the proxy keeps them locked on this URL until
//     they finish; here we resume them at their current step.
//   • Clients / guests — Loveable's `Onboarding.tsx` route IS the match quiz
//     (NEEDS → DEPARTMENT → BODY TYPE → STYLE), so we 307 them there for
//     parity rather than 403'ing.
//
// Lives at the top level (not under `(stylist)`) so the stylist layout's
// requireRole guard doesn't 401 guests before this server component runs.
// Wizard step pages stay under `(stylist)/onboarding/step-[n]/` and inherit
// the stylist layout's auth gate as expected.
export default async function OnboardingEntry() {
  const user = await getCurrentAuthUser();
  if (!user) redirect("/match-quiz");
  if (user.role !== "STYLIST") redirect("/match-quiz");
  const { step, status } = await resume(user.id);
  if (status === "AWAITING_ELIGIBILITY" || status === "ELIGIBLE") {
    redirect("/stylist/dashboard");
  }
  redirect(`/onboarding/step-${step}`);
}
