"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminOrderRow } from "@/lib/orders/admin-orders.service";
import type { OrderSource, OrderStatus } from "@/generated/prisma/client";

const SOURCE_OPTIONS: Array<{ value: OrderSource; label: string }> = [
  { value: "DIRECT_SALE", label: "Direct sale" },
  { value: "SELF_REPORTED", label: "Self-reported" },
  { value: "AFFILIATE_CONFIRMED", label: "Affiliate" },
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "ORDERED", label: "Ordered" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "ARRIVED", label: "Arrived" },
  { value: "RETURN_IN_PROCESS", label: "Return in process" },
  { value: "RETURNED", label: "Returned" },
];

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function OrdersTable({
  orders,
  activeSource,
  activeStatus,
}: {
  orders: AdminOrderRow[];
  activeSource: OrderSource;
  activeStatus: OrderStatus | null;
}) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<AdminOrderRow>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Order",
        cell: ({ row }) => (
          <Link
            href={`/admin/orders/${row.original.id}`}
            className="font-mono text-xs text-primary hover:underline"
          >
            {row.original.id.slice(0, 10)}…
          </Link>
        ),
      },
      {
        accessorKey: "clientName",
        header: "Client",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.clientName}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.clientEmail}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "retailer",
        header: "Retailer",
        cell: ({ row }) => row.original.retailer,
      },
      {
        accessorKey: "itemCount",
        header: "Items",
        cell: ({ row }) => row.original.itemCount,
      },
      {
        accessorKey: "totalInCents",
        header: "Total",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{fmtMoney(row.original.totalInCents)}</div>
            <div className="text-xs text-muted-foreground">
              tax {fmtMoney(row.original.taxInCents)} · ship{" "}
              {fmtMoney(row.original.shippingInCents)}
              {row.original.isPriorityShipping ? " (priority)" : ""}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge>{row.original.status}</Badge>,
      },
      {
        accessorKey: "trackingNumber",
        header: "Tracking",
        cell: ({ row }) =>
          row.original.trackingNumber ? (
            <span className="text-xs">
              {row.original.carrier ?? ""} {row.original.trackingNumber}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Placed",
        cell: ({ row }) => fmtDate(row.original.createdAt),
      },
    ],
    [],
  );

  function pushFilter(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    router.push(url.pathname + url.search);
  }

  return (
    <AdminDataTable
      columns={columns}
      data={orders}
      searchPlaceholder="Search by client name or email…"
      rightToolbar={
        <div className="flex gap-2">
          <Select
            value={activeSource}
            onValueChange={(v) => pushFilter("source", v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={activeStatus ?? "ALL"}
            onValueChange={(v) => pushFilter("status", v === "ALL" ? null : v)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    />
  );
}
