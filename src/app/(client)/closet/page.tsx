import { getCurrentUser } from "@/lib/auth";
import { unauthorized } from "next/navigation";
import { listClosetItems } from "@/lib/boards/closet.service";
import { ClosetPageClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ClosetPage() {
  const user = await getCurrentUser();
  if (!user) unauthorized();
  const items = await listClosetItems({ userId: user.id });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Your Closet</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Items you own. Stylists can pull from here when building styleboards.
      </p>
      <ClosetPageClient initialItems={items} />
    </div>
  );
}
