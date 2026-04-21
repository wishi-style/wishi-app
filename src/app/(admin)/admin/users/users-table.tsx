"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import type { AdminUserRow } from "@/lib/users/admin.service";

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  const columns = useMemo<ColumnDef<AdminUserRow>[]>(
    () => [
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <Link
            href={`/admin/users/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.email}
          </Link>
        ),
      },
      {
        accessorFn: (row) => `${row.firstName} ${row.lastName}`,
        id: "name",
        header: "Name",
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => <Badge variant="outline">{row.original.role}</Badge>,
      },
      {
        accessorKey: "stylistType",
        header: "Stylist Type",
        cell: ({ row }) =>
          row.original.stylistType ? (
            <Badge>{row.original.stylistType.replace("_", "-")}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Joined",
        cell: ({ row }) => fmtDate(row.original.createdAt),
      },
    ],
    [],
  );

  return (
    <AdminDataTable
      columns={columns}
      data={users}
      searchPlaceholder="Search by name or email…"
    />
  );
}
