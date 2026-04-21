import { PageHeader } from "@/components/admin/page-header";
import { listAdminSessions } from "@/lib/admin/sessions.service";
import { SessionsTable } from "./sessions-table";
import type { SessionStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const VALID_STATUSES: SessionStatus[] = [
  "BOOKED",
  "ACTIVE",
  "PENDING_END",
  "PENDING_END_APPROVAL",
  "END_DECLINED",
  "COMPLETED",
  "FROZEN",
  "REASSIGNED",
  "CANCELLED",
];

export default async function AdminSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter =
    status && (VALID_STATUSES as string[]).includes(status)
      ? (status as SessionStatus)
      : undefined;
  const sessions = await listAdminSessions({ status: filter });

  return (
    <div>
      <PageHeader
        title="Sessions"
        description={`${sessions.length} session${sessions.length === 1 ? "" : "s"}${filter ? ` · ${filter}` : ""}`}
      />
      <SessionsTable sessions={sessions} activeFilter={filter ?? null} />
    </div>
  );
}
