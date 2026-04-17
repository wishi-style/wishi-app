"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import type { AdminSubscriptionRow } from "@/lib/admin/subscriptions.service";

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SubscriptionsTable({
  subscriptions,
}: {
  subscriptions: AdminSubscriptionRow[];
}) {
  const columns = useMemo<ColumnDef<AdminSubscriptionRow>[]>(
    () => [
      {
        accessorKey: "userName",
        header: "User",
        cell: ({ row }) => (
          <Link
            href={`/admin/subscriptions/${row.original.id}`}
            className="font-medium hover:underline"
          >
            <div>{row.original.userName}</div>
            <div className="text-xs font-normal text-muted-foreground">
              {row.original.userEmail}
            </div>
          </Link>
        ),
      },
      {
        accessorKey: "planType",
        header: "Plan",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.planType} · {row.original.frequency}
          </Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge>{row.original.status}</Badge>,
      },
      {
        accessorKey: "currentPeriodEnd",
        header: "Renews",
        cell: ({ row }) => fmtDate(row.original.currentPeriodEnd),
      },
      {
        accessorKey: "cancelRequestedAt",
        header: "Flags",
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.cancelRequestedAt ? (
              <Badge variant="destructive">Cancelling</Badge>
            ) : null}
            {row.original.pausedUntil ? (
              <Badge variant="outline">Paused</Badge>
            ) : null}
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <AdminDataTable
      columns={columns}
      data={subscriptions}
      searchPlaceholder="Search by user name or email…"
    />
  );
}
