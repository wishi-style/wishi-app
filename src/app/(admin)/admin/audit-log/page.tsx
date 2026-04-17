import { PageHeader } from "@/components/admin/page-header";
import { listAuditLog } from "@/lib/audit/list";
import { AuditLogTable } from "./audit-log-table";

export const dynamic = "force-dynamic";

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{
    entityType?: string;
    action?: string;
    actor?: string;
  }>;
}) {
  const params = await searchParams;
  const rows = await listAuditLog({
    entityType: params.entityType,
    action: params.action,
    actorUserId: params.actor,
  });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description={`${rows.length} recent event${rows.length === 1 ? "" : "s"}`}
      />
      <AuditLogTable rows={rows} filters={params} />
    </div>
  );
}
