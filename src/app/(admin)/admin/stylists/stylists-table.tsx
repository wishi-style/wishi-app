"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import type { AdminStylistRow } from "@/lib/admin/stylists.service";

export function StylistsTable({ stylists }: { stylists: AdminStylistRow[] }) {
  const columns = useMemo<ColumnDef<AdminStylistRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Stylist",
        cell: ({ row }) => (
          <Link
            href={`/admin/stylists/${row.original.userId}`}
            className="font-medium hover:underline"
          >
            <div>{row.original.name}</div>
            <div className="text-xs font-normal text-muted-foreground">
              {row.original.email}
            </div>
          </Link>
        ),
      },
      {
        accessorKey: "stylistType",
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.stylistType.replace("_", "-")}
          </Badge>
        ),
      },
      {
        accessorKey: "onboardingStatus",
        header: "Onboarding",
        cell: ({ row }) => (
          <Badge variant="outline">
            {row.original.onboardingStatus.replace(/_/g, " ").toLowerCase()}
          </Badge>
        ),
      },
      {
        accessorKey: "matchEligible",
        header: "Eligibility",
        cell: ({ row }) =>
          row.original.matchEligible ? (
            <Badge>Eligible</Badge>
          ) : (
            <Badge variant="outline">Pending</Badge>
          ),
      },
      {
        accessorKey: "stripeConnected",
        header: "Stripe",
        cell: ({ row }) =>
          row.original.stripeConnected ? (
            <Badge variant="outline">Connected</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "pendingWaitlist",
        header: "Waitlist",
        cell: ({ row }) =>
          row.original.pendingWaitlist ? (
            <Badge variant="outline">
              {row.original.pendingWaitlist} waiting
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <AdminDataTable
      columns={columns}
      data={stylists}
      searchPlaceholder="Search by name or email…"
    />
  );
}
