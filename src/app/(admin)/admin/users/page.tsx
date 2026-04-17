import { PageHeader } from "@/components/admin/page-header";
import { listAdminUsers } from "@/lib/users/admin.service";
import { UsersTable } from "./users-table";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const users = await listAdminUsers();
  return (
    <div>
      <PageHeader
        title="Users"
        description="Search, promote, and manage platform accounts."
      />
      <UsersTable users={users} />
    </div>
  );
}
