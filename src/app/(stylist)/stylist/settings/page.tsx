import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Stub for the Settings menu item the Loveable header dropdown surfaces.
 * Loveable's `App.tsx@19f4732` doesn't actually register a settings route,
 * so the menu item dead-links there too — staging gives it a soft landing
 * page until the settings UI ships. The backend (Clerk profile, billing
 * portal, push preferences) is already wired through other surfaces.
 */
export default async function StylistSettingsPage() {
  await requireRole("STYLIST");
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col">
      <div className="px-6 py-4 border-b border-border bg-background">
        <Link
          href="/stylist/dashboard"
          className="inline-flex items-center gap-2 text-sm font-body text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="max-w-md text-center space-y-3">
          <h1 className="font-display text-2xl">Settings</h1>
          <p className="font-body text-sm text-muted-foreground">
            Account, notifications, and payout settings live here. We&apos;re
            still building the page — meanwhile you can manage profile details
            from{" "}
            <Link
              href="/stylist/profile"
              className="text-foreground underline underline-offset-4"
            >
              your profile
            </Link>{" "}
            and payout history at{" "}
            <Link
              href="/stylist/payouts"
              className="text-foreground underline underline-offset-4"
            >
              payouts
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
