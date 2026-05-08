import { notFound } from "next/navigation";
import { RestyleWizardHarness } from "./harness-client";

export const dynamic = "force-dynamic";

// Layout-regression harness: mounts RestyleWizard with the same shape the
// chat surface passes (3 products) so e2e specs can pin the dialog layout
// without seeding a Twilio-backed chat session. Disabled outside dev/e2e
// so production builds never expose it.
export default function RestyleWizardHarnessPage() {
  if (process.env.NODE_ENV === "production" && process.env.E2E_AUTH_MODE !== "true") {
    notFound();
  }
  return <RestyleWizardHarness />;
}
