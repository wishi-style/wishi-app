"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { AdminDataTable } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuditLogRow } from "@/lib/audit/list";

function fmt(d: Date | string) {
  return new Date(d).toLocaleString();
}

export function AuditLogTable({
  rows,
  filters,
}: {
  rows: AuditLogRow[];
  filters: { entityType?: string; action?: string; actor?: string };
}) {
  const router = useRouter();
  const [entityType, setEntityType] = useState(filters.entityType ?? "");
  const [action, setAction] = useState(filters.action ?? "");
  const [actor, setActor] = useState(filters.actor ?? "");

  function applyFilters() {
    const params = new URLSearchParams();
    if (entityType.trim()) params.set("entityType", entityType.trim());
    if (action.trim()) params.set("action", action.trim());
    if (actor.trim()) params.set("actor", actor.trim());
    router.push(`/admin/audit-log${params.size ? `?${params}` : ""}`);
  }

  function clearFilters() {
    setEntityType("");
    setAction("");
    setActor("");
    router.push("/admin/audit-log");
  }

  const columns = useMemo<ColumnDef<AuditLogRow>[]>(
    () => [
      {
        accessorKey: "createdAt",
        header: "When",
        cell: ({ row }) => (
          <div className="font-mono text-xs">{fmt(row.original.createdAt)}</div>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
      },
      {
        accessorKey: "entityType",
        header: "Entity",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.entityType}</div>
            {row.original.entityId ? (
              <div className="font-mono text-xs text-muted-foreground">
                {row.original.entityId.slice(0, 16)}…
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "actorName",
        header: "Actor",
        cell: ({ row }) =>
          row.original.actorName ? (
            <div>
              <div>{row.original.actorName}</div>
              <div className="text-xs text-muted-foreground">
                {row.original.actorEmail}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">system</span>
          ),
      },
      {
        accessorKey: "meta",
        header: "Meta",
        cell: ({ row }) =>
          row.original.meta ? (
            <pre className="max-w-xs overflow-hidden text-ellipsis text-xs text-muted-foreground">
              {JSON.stringify(row.original.meta)}
            </pre>
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  return (
    <AdminDataTable
      columns={columns}
      data={rows}
      rightToolbar={
        <div className="flex items-center gap-2">
          <Input
            placeholder="Entity (e.g. Session)"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="w-36"
          />
          <Input
            placeholder="Action (e.g. session.cancel)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="w-44"
          />
          <Input
            placeholder="Actor user ID"
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            className="w-36"
          />
          <Button variant="outline" onClick={applyFilters}>
            Apply
          </Button>
          <Button variant="ghost" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      }
    />
  );
}
