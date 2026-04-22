"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ClientOrderRow } from "@/lib/orders/client-orders.service";

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

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ORDERED: "Ordered",
  SHIPPED: "Shipped",
  ARRIVED: "Delivered",
  RETURN_IN_PROCESS: "Return in process",
  RETURNED: "Returned",
};

export function OrdersList({ initialOrders }: { initialOrders: ClientOrderRow[] }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [pending, startTransition] = useTransition();
  const [actingOn, setActingOn] = useState<string | null>(null);

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No orders yet. When you buy something through your stylist&apos;s
          styleboard, it&apos;ll appear here.
        </CardContent>
      </Card>
    );
  }

  async function startReturn(orderId: string) {
    if (!confirm("Start a return for this order?")) return;
    setActingOn(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/return`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error ?? "Return failed");
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: "RETURN_IN_PROCESS", isReturnEligible: false }
            : o,
        ),
      );
      startTransition(() => router.refresh());
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Card key={order.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">
                {order.retailer}
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  #{order.id.slice(0, 8)}
                </span>
              </CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                Placed {fmtDate(order.createdAt)}
                {order.shippedAt ? ` · shipped ${fmtDate(order.shippedAt)}` : ""}
                {order.arrivedAt ? ` · delivered ${fmtDate(order.arrivedAt)}` : ""}
              </div>
              {order.trackingNumber ? (
                <div className="mt-1 text-xs">
                  Tracking: {order.carrier ?? ""} {order.trackingNumber}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              {order.isPriorityShipping ? (
                <Badge variant="outline">Priority (Lux)</Badge>
              ) : null}
              <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/20 p-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.brand ?? ""}
                      {item.brand && item.size ? " · " : ""}
                      {item.size ? `Size ${item.size}` : ""}
                      {item.quantity > 1 ? ` · qty ${item.quantity}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    {fmtMoney(item.priceInCents * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-end justify-between">
              <div className="text-xs text-muted-foreground">
                Subtotal {fmtMoney(order.totalInCents - order.taxInCents - order.shippingInCents)}{" "}
                · tax {fmtMoney(order.taxInCents)} · shipping{" "}
                {fmtMoney(order.shippingInCents)}
              </div>
              <div className="text-right">
                <div className="text-xs uppercase text-muted-foreground">Total</div>
                <div className="text-base font-semibold">
                  {fmtMoney(order.totalInCents)}
                </div>
              </div>
            </div>
            {order.isReturnEligible ? (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || actingOn === order.id}
                  onClick={() => startReturn(order.id)}
                >
                  {actingOn === order.id ? "Starting return…" : "Start return"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
