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
import type { AdminSessionRow } from "@/lib/admin/sessions.service";
import type { SessionStatus } from "@/generated/prisma/client";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "BOOKED", label: "Booked" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING_END", label: "Pending end" },
  { value: "PENDING_END_APPROVAL", label: "Pending approval" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FROZEN", label: "Frozen" },
  { value: "CANCELLED", label: "Cancelled" },
];

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SessionsTable({
  sessions,
  activeFilter,
}: {
  sessions: AdminSessionRow[];
  activeFilter: SessionStatus | null;
}) {
  const router = useRouter();
  const columns = useMemo<ColumnDef<AdminSessionRow>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Session",
        cell: ({ row }) => (
          <Link
            href={`/admin/sessions/${row.original.id}`}
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
        accessorKey: "stylistName",
        header: "Stylist",
        cell: ({ row }) =>
          row.original.stylistName ?? (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "planType",
        header: "Plan",
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.planType}</Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <Badge>{row.original.status}</Badge>,
      },
      {
        accessorKey: "createdAt",
        header: "Booked",
        cell: ({ row }) => fmtDate(row.original.createdAt),
      },
    ],
    [],
  );

  return (
    <AdminDataTable
      columns={columns}
      data={sessions}
      searchPlaceholder="Search by client name, email, or stylist…"
      rightToolbar={
        <Select
          value={activeFilter ?? "ALL"}
          onValueChange={(v) => {
            if (v === null) return;
            const url = new URL(window.location.href);
            if (v === "ALL") url.searchParams.delete("status");
            else url.searchParams.set("status", v);
            router.push(url.pathname + url.search);
          }}
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
      }
    />
  );
}
