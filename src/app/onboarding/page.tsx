import { redirect } from "next/navigation";

// Loveable mounts the NEEDS → DEPARTMENT → BODY TYPE → STYLE quiz at both
// `/onboarding` and `/match-quiz`-style entry points. The actual flow lives
// at /match-quiz here; this alias keeps any existing /onboarding links
// resolving to the same UX rather than 404ing.
export default function OnboardingAliasPage(): never {
  redirect("/match-quiz");
}
