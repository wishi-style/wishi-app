import { PageHeader } from "@/components/admin/page-header";
import { listAdminStylists } from "@/lib/admin/stylists.service";
import { StylistsTable } from "./stylists-table";

export const dynamic = "force-dynamic";

export default async function AdminStylistsPage() {
  const stylists = await listAdminStylists();
  return (
    <div>
      <PageHeader
        title="Stylists"
        description={`${stylists.length} total · ${stylists.filter((s) => s.matchEligible).length} match-eligible`}
      />
      <StylistsTable stylists={stylists} />
    </div>
  );
}
