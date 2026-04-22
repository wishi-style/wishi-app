"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { AdminDataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminPromoCodeRow } from "@/lib/promotions/promo-code.service";

function fmtDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PromoCodesTable({ codes }: { codes: AdminPromoCodeRow[] }) {
  const router = useRouter();

  async function deactivate(id: string, code: string) {
    if (!confirm(`Deactivate ${code}? This removes the Stripe coupon too.`)) return;
    const res = await fetch(`/api/admin/promo-codes/${id}/deactivate`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      alert(err.error ?? "Deactivate failed");
      return;
    }
    router.refresh();
  }

  const columns = useMemo<ColumnDef<AdminPromoCodeRow>[]>(
    () => [
      {
        accessorKey: "code",
        header: "Code",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.code}</span>
        ),
      },
      {
        accessorKey: "creditType",
        header: "Type",
        cell: ({ row }) => <Badge variant="outline">{row.original.creditType}</Badge>,
      },
      {
        accessorKey: "amountInCents",
        header: "Amount",
        cell: ({ row }) => fmtMoney(row.original.amountInCents),
      },
      {
        accessorKey: "usedCount",
        header: "Usage",
        cell: ({ row }) =>
          `${row.original.usedCount}${
            row.original.usageLimit !== null ? ` / ${row.original.usageLimit}` : ""
          }`,
      },
      {
        accessorKey: "expiresAt",
        header: "Expires",
        cell: ({ row }) => fmtDate(row.original.expiresAt),
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge>Active</Badge>
          ) : (
            <Badge variant="destructive">Inactive</Badge>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          row.original.isActive ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => deactivate(row.original.id, row.original.code)}
            >
              Deactivate
            </Button>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <AdminDataTable
      columns={columns}
      data={codes}
      searchPlaceholder="Search by code…"
    />
  );
}
