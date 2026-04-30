"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRightIcon, ClockIcon, PackageCheckIcon, RotateCcwIcon, TruckIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ClientOrderRow } from "@/lib/orders/client-orders.service";

type OrdersTab = "all" | "active" | "past";

const ACTIVE_STATUSES = new Set<ClientOrderRow["status"]>([
  "PENDING",
  "ORDERED",
  "SHIPPED",
]);

type ProgressStatus = "processing" | "shipped" | "delivered";

function progressStatusFor(status: ClientOrderRow["status"]): ProgressStatus {
  if (status === "SHIPPED") return "shipped";
  if (status === "ARRIVED" || status === "RETURN_IN_PROCESS" || status === "RETURNED") {
    return "delivered";
  }
  return "processing";
}

const statusConfig: Record<ProgressStatus, { label: string; Icon: typeof ClockIcon }> = {
  processing: { label: "Processing", Icon: ClockIcon },
  shipped: { label: "In Transit", Icon: TruckIcon },
  delivered: { label: "Delivered", Icon: PackageCheckIcon },
};

function fmtMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function fmtDateShort(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function totalItems(order: ClientOrderRow): number {
  return order.items.reduce((sum, i) => sum + i.quantity, 0);
}

function TrackingProgress({ status }: { status: ProgressStatus }) {
  const steps: ProgressStatus[] = ["processing", "shipped", "delivered"];
  const activeIndex = steps.indexOf(status);

  return (
    <div className="mt-4 mb-2 flex w-full items-center gap-0">
      {steps.map((step, i) => (
        <div key={step} className="relative flex flex-1 flex-col items-center">
          {i > 0 && (
            <div
              className={cn(
                "absolute right-1/2 top-[9px] h-[2px] w-full",
                i <= activeIndex ? "bg-foreground" : "bg-border",
              )}
            />
          )}
          <div
            className={cn(
              "relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2",
              i <= activeIndex
                ? "border-foreground bg-foreground"
                : "border-border bg-background",
            )}
          >
            {i <= activeIndex && <div className="h-1.5 w-1.5 rounded-full bg-background" />}
          </div>
          <span
            className={cn(
              "mt-1.5 text-[10px]",
              i <= activeIndex ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {statusConfig[step].label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OrdersList({ initialOrders }: { initialOrders: ClientOrderRow[] }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [pending, startTransition] = useTransition();
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<string | null>(null);
  const [tab, setTab] = useState<OrdersTab>("all");

  const { activeOrders, pastOrders } = useMemo(() => {
    const active: ClientOrderRow[] = [];
    const past: ClientOrderRow[] = [];
    for (const order of orders) {
      if (ACTIVE_STATUSES.has(order.status)) active.push(order);
      else past.push(order);
    }
    return { activeOrders: active, pastOrders: past };
  }, [orders]);

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <p className="text-sm text-muted-foreground">
          No orders yet. When you buy something through your stylist&apos;s
          styleboard, it&apos;ll appear here.
        </p>
      </div>
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

  function renderOrder(order: ClientOrderRow) {
    const thumbnails = order.items.slice(0, 3);
    const overflow = order.items.length - thumbnails.length;
    const progressStatus = progressStatusFor(order.status);
    const isActive = ACTIVE_STATUSES.has(order.status);
    const isExpanded = detailOrder === order.id;

    return (
      <div
        key={order.id}
        className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-sm"
      >
        <div className="p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="shrink-0 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="text-sm font-medium">{fmtDateShort(order.createdAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Order No.</p>
                <p className="text-sm font-medium">
                  {order.orderReference ?? order.id.slice(0, 9).toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Order Total</p>
                <p className="text-sm font-medium">{fmtMoney(order.totalInCents)}</p>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center gap-3">
              {thumbnails.map((item) => (
                <div
                  key={item.id}
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted md:h-24 md:w-24"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                </div>
              ))}
              {overflow > 0 && (
                <span className="text-xs text-muted-foreground">+{overflow}</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setDetailOrder(isExpanded ? null : order.id)}
              className="flex shrink-0 items-center gap-1 text-sm text-foreground underline underline-offset-4 transition-colors hover:text-foreground/70"
            >
              Order Details
              <ChevronRightIcon
                className={cn(
                  "h-4 w-4 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </button>
          </div>

          {isActive && <TrackingProgress status={progressStatus} />}
        </div>

        {isExpanded && (
          <div className="border-t border-border bg-muted/20">
            {order.trackingNumber && order.status === "SHIPPED" && (
              <div className="border-b border-border px-6 py-4">
                <p className="mb-1 text-xs text-muted-foreground">Tracking Number</p>
                <p className="font-mono text-sm font-medium">
                  {order.carrier ? `${order.carrier} · ` : ""}
                  {order.trackingNumber}
                </p>
              </div>
            )}

            <div className="divide-y divide-border">
              {order.items.map((item) => (
                <div key={item.id} className="flex gap-4 p-6">
                  <div className="h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    {item.brand && (
                      <p className="text-sm font-medium text-foreground">{item.brand}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.title}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      {item.size && (
                        <p className="text-xs text-muted-foreground">
                          Size: <span className="text-foreground">{item.size}</span>
                        </p>
                      )}
                      {item.color && (
                        <p className="text-xs text-muted-foreground">
                          Color: <span className="text-foreground">{item.color}</span>
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Qty: <span className="text-foreground">{item.quantity}</span>
                      </p>
                    </div>
                    <p className="mt-2 text-sm font-medium text-foreground">
                      {fmtMoney(item.priceInCents * item.quantity)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      via {order.retailer}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {order.isReturnEligible && (
              <div className="flex justify-end border-t border-border px-6 py-3">
                <button
                  type="button"
                  onClick={() => startReturn(order.id)}
                  disabled={pending || actingOn === order.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                >
                  <RotateCcwIcon className="h-3 w-3" />
                  {actingOn === order.id ? "Starting return…" : "Start a Return"}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <p className="text-xs text-muted-foreground">
                {totalItems(order)} item{totalItems(order) !== 1 ? "s" : ""} · Ordered{" "}
                {fmtDateShort(order.createdAt)}
              </p>
              <p className="text-sm font-medium">Total: {fmtMoney(order.totalInCents)}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  function emptyState(message: string) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as OrdersTab)} className="w-full">
      <TabsList className="mb-6">
        <TabsTrigger value="all">All ({orders.length})</TabsTrigger>
        <TabsTrigger value="active">Active ({activeOrders.length})</TabsTrigger>
        <TabsTrigger value="past">Past ({pastOrders.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="all" className="space-y-4">
        {orders.map(renderOrder)}
      </TabsContent>
      <TabsContent value="active" className="space-y-4">
        {activeOrders.length > 0 ? activeOrders.map(renderOrder) : emptyState("No active orders")}
      </TabsContent>
      <TabsContent value="past" className="space-y-4">
        {pastOrders.length > 0 ? pastOrders.map(renderOrder) : emptyState("No past orders yet")}
      </TabsContent>
    </Tabs>
  );
}
