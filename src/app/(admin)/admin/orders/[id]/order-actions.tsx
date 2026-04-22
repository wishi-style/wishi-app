"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import type { OrderStatus } from "@/generated/prisma/client";

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function OrderActions({
  orderId,
  status,
  allowedStatuses,
  trackingNumber,
  carrier,
  customerTeamNotes,
  refundableInCents,
  refundSoftCapInCents,
  canRefund,
}: {
  orderId: string;
  status: OrderStatus;
  allowedStatuses: OrderStatus[];
  trackingNumber: string | null;
  carrier: string | null;
  customerTeamNotes: string | null;
  refundableInCents: number;
  refundSoftCapInCents: number;
  canRefund: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [trackingInput, setTrackingInput] = useState(trackingNumber ?? "");
  const [carrierInput, setCarrierInput] = useState(carrier ?? "");
  const [notesInput, setNotesInput] = useState(customerTeamNotes ?? "");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");

  async function post(path: string, body: unknown, label: string) {
    setPending(label);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error ?? "Action failed");
        return;
      }
      if (json.warning) alert(json.warning);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const refundCents = Math.round(Number(refundAmount) * 100);
  const refundExceedsCap =
    Number.isFinite(refundCents) && refundCents > refundSoftCapInCents;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="carrier">Carrier</Label>
            <Input
              id="carrier"
              value={carrierInput}
              onChange={(e) => setCarrierInput(e.target.value)}
              placeholder="UPS / FedEx / USPS"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="tracking">Tracking number</Label>
            <Input
              id="tracking"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              placeholder="1Z..."
            />
          </div>
          <Button
            size="sm"
            disabled={
              pending !== null ||
              !trackingInput.trim() ||
              !carrierInput.trim()
            }
            onClick={() =>
              post(
                `/api/admin/orders/${orderId}/tracking`,
                {
                  trackingNumber: trackingInput.trim(),
                  carrier: carrierInput.trim(),
                },
                "tracking",
              )
            }
          >
            {pending === "tracking" ? "Saving…" : "Save tracking"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-muted-foreground">Current: {status}</div>
          {allowedStatuses.length === 0 ? (
            <p className="text-xs text-muted-foreground">Terminal state.</p>
          ) : (
            <>
              <Select
                value={nextStatus}
                onValueChange={(v) => setNextStatus(v as OrderStatus)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Advance to…" />
                </SelectTrigger>
                <SelectContent>
                  {allowedStatuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={pending !== null || !nextStatus}
                onClick={() =>
                  post(
                    `/api/admin/orders/${orderId}/status`,
                    { status: nextStatus },
                    "status",
                  )
                }
              >
                {pending === "status" ? "Saving…" : "Advance status"}
              </Button>
              {nextStatus === "ARRIVED" ? (
                <p className="text-xs text-muted-foreground">
                  Marking ARRIVED will auto-create ClosetItems for the customer.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            value={notesInput}
            onChange={(e) => setNotesInput(e.target.value)}
            placeholder="Customer-team notes (not shown to client)"
          />
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              post(
                `/api/admin/orders/${orderId}/notes`,
                { notes: notesInput },
                "notes",
              )
            }
          >
            {pending === "notes" ? "Saving…" : "Save notes"}
          </Button>
        </CardContent>
      </Card>

      {canRefund && refundableInCents > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Refund</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Refundable: {fmtMoney(refundableInCents)}
            </div>
            <div className="space-y-1">
              <Label htmlFor="refund-amount">Amount (USD)</Label>
              <Input
                id="refund-amount"
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="refund-reason">Reason</Label>
              <Input
                id="refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="requested_by_customer"
              />
            </div>
            {refundExceedsCap ? (
              <p className="text-xs text-amber-600">
                ⚠ Exceeds soft cap of {fmtMoney(refundSoftCapInCents)} — manager
                approval recommended.
              </p>
            ) : null}
            <Button
              size="sm"
              variant={refundExceedsCap ? "secondary" : "default"}
              disabled={
                pending !== null ||
                !Number.isFinite(refundCents) ||
                refundCents <= 0 ||
                refundCents > refundableInCents
              }
              onClick={() => {
                if (
                  refundExceedsCap &&
                  !confirm(
                    `Refund ${fmtMoney(refundCents)} exceeds soft cap. Proceed?`,
                  )
                ) {
                  return;
                }
                const path =
                  status === "RETURN_IN_PROCESS"
                    ? `/api/admin/orders/${orderId}/approve-refund`
                    : `/api/admin/orders/${orderId}/refund`;
                post(
                  path,
                  {
                    amountInCents: refundCents,
                    reason: refundReason.trim() || undefined,
                  },
                  "refund",
                );
              }}
            >
              {pending === "refund" ? "Processing…" : "Issue refund"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
