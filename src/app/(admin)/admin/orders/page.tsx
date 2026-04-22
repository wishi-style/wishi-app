import { PageHeader } from "@/components/admin/page-header";
import { listAdminOrders } from "@/lib/orders/admin-orders.service";
import type { OrderSource, OrderStatus } from "@/generated/prisma/client";
import { OrdersTable } from "./orders-table";

export const dynamic = "force-dynamic";

const VALID_SOURCES: OrderSource[] = ["DIRECT_SALE", "SELF_REPORTED", "AFFILIATE_CONFIRMED"];
const VALID_STATUSES: OrderStatus[] = [
  "PENDING",
  "ORDERED",
  "SHIPPED",
  "ARRIVED",
  "RETURN_IN_PROCESS",
  "RETURNED",
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; status?: string }>;
}) {
  const { source, status } = await searchParams;
  const sourceFilter =
    source && (VALID_SOURCES as string[]).includes(source)
      ? (source as OrderSource)
      : undefined;
  const statusFilter =
    status && (VALID_STATUSES as string[]).includes(status)
      ? (status as OrderStatus)
      : undefined;

  // Default the queue view to direct-sale + ORDERED so the customer-team
  // workflow opens with the actionable backlog, not the noisy global list.
  const effectiveSource = sourceFilter ?? "DIRECT_SALE";
  const effectiveStatus =
    statusFilter ?? (effectiveSource === "DIRECT_SALE" ? "ORDERED" : undefined);

  const orders = await listAdminOrders({
    source: effectiveSource,
    status: effectiveStatus,
  });

  return (
    <div>
      <PageHeader
        title="Orders"
        description={`${orders.length} ${effectiveSource.toLowerCase().replace("_", "-")} order${
          orders.length === 1 ? "" : "s"
        }${effectiveStatus ? ` · ${effectiveStatus}` : ""}`}
      />
      <OrdersTable
        orders={orders}
        activeSource={effectiveSource}
        activeStatus={effectiveStatus ?? null}
      />
    </div>
  );
}
