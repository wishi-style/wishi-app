import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { buttonVariants } from "@/components/ui/button";
import { listAdminStylists } from "@/lib/admin/stylists.service";
import { StylistsTable } from "./stylists-table";
import { InviteStylistButton } from "./invite-stylist-button";

export const dynamic = "force-dynamic";

export default async function AdminStylistsPage() {
  const stylists = await listAdminStylists();
  return (
    <div>
      <PageHeader
        title="Stylists"
        description={`${stylists.length} total · ${stylists.filter((s) => s.matchEligible).length} match-eligible`}
        actions={
          <>
            <Link
              href="/admin/stylists/invites"
              className={buttonVariants({ variant: "outline" })}
            >
              Invitations
            </Link>
            <InviteStylistButton />
          </>
        }
      />
      <StylistsTable stylists={stylists} />
    </div>
  );
}
