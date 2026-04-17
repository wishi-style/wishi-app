"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import type { AdminLookRow } from "@/lib/admin/looks.service";

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function LooksTable({ looks }: { looks: AdminLookRow[] }) {
  const columns = useMemo<ColumnDef<AdminLookRow>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Board",
        cell: ({ row }) => (
          <div className="font-mono text-xs">
            {row.original.id.slice(0, 10)}…
          </div>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) =>
          row.original.title ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "type",
        header: "Type",
        cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge>,
      },
      {
        accessorKey: "ownerKind",
        header: "Owner",
        cell: ({ row }) =>
          row.original.ownerKind === "editorial" ? (
            <Badge>Editorial</Badge>
          ) : (
            <Badge variant="outline">{row.original.ownerName}</Badge>
          ),
      },
      {
        accessorKey: "profileStyle",
        header: "Style",
        cell: ({ row }) =>
          row.original.profileStyle ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "isFeaturedOnProfile",
        header: "Featured",
        cell: ({ row }) =>
          row.original.isFeaturedOnProfile ? (
            <Badge variant="outline">On profile</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => fmtDate(row.original.createdAt),
      },
    ],
    [],
  );

  return (
    <AdminDataTable
      columns={columns}
      data={looks}
      searchPlaceholder="Search by title, style, or owner…"
    />
  );
}
