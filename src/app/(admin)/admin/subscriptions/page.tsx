import { PageHeader } from "@/components/admin/page-header";
import { listAdminSubscriptions } from "@/lib/admin/subscriptions.service";
import { SubscriptionsTable } from "./subscriptions-table";

export const dynamic = "force-dynamic";

export default async function AdminSubscriptionsPage() {
  const subscriptions = await listAdminSubscriptions();
  return (
    <div>
      <PageHeader
        title="Subscriptions"
        description={`${subscriptions.length} total`}
      />
      <SubscriptionsTable subscriptions={subscriptions} />
    </div>
  );
}
