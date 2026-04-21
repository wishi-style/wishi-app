import { PageHeader } from "@/components/admin/page-header";
import { listAdminLooks } from "@/lib/admin/looks.service";
import { LooksTable } from "./looks-table";

export const dynamic = "force-dynamic";

export default async function AdminLooksPage() {
  const looks = await listAdminLooks();
  return (
    <div>
      <PageHeader
        title="Outfits & looks"
        description={`${looks.length} look${looks.length === 1 ? "" : "s"} · includes stylist-profile boards and editorial uploads`}
      />
      <LooksTable looks={looks} />
    </div>
  );
}
