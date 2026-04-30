import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Stub for the "My Dressing Room" header dropdown item. Loveable's
 * `App.tsx@19f4732` does not register a dressing-room route either; the
 * dropdown item points at `/stylist/dressing-room` with no destination.
 * Staging gives it a soft landing page until the dressing-room surface
 * ships.
 */
export default async function StylistDressingRoomPage() {
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
          <h1 className="font-display text-2xl">My Dressing Room</h1>
          <p className="font-body text-sm text-muted-foreground">
            Your shopping queue, saved looks, and outfit drafts will live
            here. We&apos;re still building the page — meanwhile you can keep
            curating client looks from{" "}
            <Link
              href="/stylist/dashboard"
              className="text-foreground underline underline-offset-4"
            >
              the dashboard
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
