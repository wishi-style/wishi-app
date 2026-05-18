"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { OrderItem } from "@/generated/prisma/client";

const UNFULFILLABLE_REASON_LABELS: Record<string, string> = {
  out_of_stock: "Out of stock",
  wont_ship: "Won't ship to user",
  price_jumped: "Price jumped",
  retailer_issue: "Retailer issue",
  other: "Other",
};

type ItemMode = "view" | "purchase" | "unfulfillable";

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Per-OrderItem fulfillment actions for the admin queue.
 *
 * - PENDING: [Mark Purchased] (captures retailer order #) or [Mark
 *   Unfulfillable] (captures reason → fires partial Stripe refund for the
 *   line + line tax share).
 * - PURCHASED: shows retailer order ref. No actions (user-initiated
 *   returns flip the state through the client orders page).
 * - UNFULFILLABLE: shows reason + refund amount. Terminal.
 * - RETURN_REQUESTED: [Mark Returned] verifies the user's retailer return
 *   reference, fires the mirror Stripe refund.
 * - RETURNED: shows the refund. Terminal.
 */
export function OrderItemActions({
  orderId,
  item,
}: {
  orderId: string;
  item: OrderItem;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<ItemMode>("view");
  const [pending, setPending] = useState(false);
  const [retailerOrderRef, setRetailerOrderRef] = useState("");
  const [unfulfillableReason, setUnfulfillableReason] = useState<string>("");
  const [unfulfillableNotes, setUnfulfillableNotes] = useState("");

  async function post(body: Record<string, unknown>) {
    setPending(true);
    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/items/${item.id}/status`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error ?? "Action failed");
        return;
      }
      if (json.refundedInCents > 0) {
        alert(`Refunded ${fmtMoney(json.refundedInCents)} to the user.`);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.title}</div>
          <div className="text-xs text-muted-foreground">
            {item.brand ?? "—"} · qty {item.quantity}
            {item.size ? ` · size ${item.size}` : ""}
            {item.retailerName ? ` · ${item.retailerName}` : ""}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {fmtMoney(item.priceInCents * item.quantity)}
          </div>
          {item.status === "PURCHASED" && item.retailerOrderRef && (
            <div className="mt-2 text-xs">
              Retailer order ref:{" "}
              <span className="font-mono text-foreground">
                {item.retailerOrderRef}
              </span>
            </div>
          )}
          {item.status === "UNFULFILLABLE" && (
            <div className="mt-2 text-xs">
              {item.unfulfillableReason && (
                <span className="text-foreground">
                  {UNFULFILLABLE_REASON_LABELS[item.unfulfillableReason] ??
                    item.unfulfillableReason}
                </span>
              )}
              {item.refundedInCents > 0 && (
                <span className="ml-2 text-muted-foreground">
                  · Refunded {fmtMoney(item.refundedInCents)}
                </span>
              )}
              {item.unfulfillableNotes && (
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {item.unfulfillableNotes}
                </div>
              )}
            </div>
          )}
          {item.status === "RETURN_REQUESTED" && item.returnReceiptRef && (
            <div className="mt-2 text-xs">
              Retailer return ref:{" "}
              <span className="font-mono text-foreground">
                {item.returnReceiptRef}
              </span>
            </div>
          )}
          {item.status === "RETURNED" && item.refundedInCents > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              Refunded {fmtMoney(item.refundedInCents)}
              {item.refundedAt
                ? ` · ${new Date(item.refundedAt).toLocaleDateString()}`
                : ""}
            </div>
          )}
        </div>
        <Badge variant={item.status === "PENDING" ? "secondary" : "outline"}>
          {item.status}
        </Badge>
      </div>

      {mode === "view" && item.status === "PENDING" && (
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={() => setMode("purchase")}
            disabled={pending}
          >
            Mark purchased
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode("unfulfillable")}
            disabled={pending}
          >
            Can&apos;t source
          </Button>
        </div>
      )}

      {mode === "view" && item.status === "RETURN_REQUESTED" && (
        <div className="mt-3">
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  `Confirm the user returned this to ${item.retailerName ?? "the retailer"} and the retailer refunded the line. Wishi will mirror the refund to the user's card.`,
                )
              ) {
                return;
              }
              void post({ status: "RETURNED" });
            }}
          >
            {pending ? "Refunding…" : "Mark returned · mirror refund"}
          </Button>
        </div>
      )}

      {mode === "purchase" && (
        <div className="mt-3 space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`ref-${item.id}`} className="text-xs">
              Retailer order # (optional)
            </Label>
            <Input
              id={`ref-${item.id}`}
              value={retailerOrderRef}
              onChange={(e) => setRetailerOrderRef(e.target.value)}
              placeholder="e.g. NAP-12345"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                post({
                  status: "PURCHASED",
                  retailerOrderRef: retailerOrderRef.trim() || undefined,
                })
              }
            >
              {pending ? "Saving…" : "Confirm purchased"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode("view")}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "unfulfillable" && (
        <div className="mt-3 space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Reason</Label>
            <Select
              value={unfulfillableReason}
              onValueChange={setUnfulfillableReason}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a reason…" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(UNFULFILLABLE_REASON_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`notes-${item.id}`} className="text-xs">
              Notes (user-facing in the partial-fulfillment email)
            </Label>
            <Textarea
              id={`notes-${item.id}`}
              rows={3}
              value={unfulfillableNotes}
              onChange={(e) => setUnfulfillableNotes(e.target.value)}
              placeholder="Brief explanation — visible to the user"
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || !unfulfillableReason}
              onClick={() => {
                const refundEstimate = item.priceInCents * item.quantity;
                if (
                  !confirm(
                    `Mark unfulfillable and refund ${fmtMoney(refundEstimate)} (plus line tax) to the user?`,
                  )
                ) {
                  return;
                }
                void post({
                  status: "UNFULFILLABLE",
                  unfulfillableReason,
                  unfulfillableNotes: unfulfillableNotes.trim() || undefined,
                });
              }}
            >
              {pending ? "Refunding…" : "Confirm unfulfillable"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode("view")}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
