import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  getAdminOrderDetail,
  nextAllowedStatuses,
  REFUND_SOFT_CAP_CENTS,
} from "@/lib/orders/admin-orders.service";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString() : "—";
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function AdminOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getAdminOrderDetail(id);
  if (!order) notFound();

  const allowedStatuses = nextAllowedStatuses(order.status);
  const refundedInCents = order.refundedInCents ?? 0;
  const refundableInCents = order.totalInCents - refundedInCents;

  return (
    <div>
      <PageHeader
        title={`Order ${order.id.slice(0, 10)}…`}
        description={`${order.source} · ${order.user.firstName} ${order.user.lastName} · ${order.retailer}`}
        actions={
          <div className="flex gap-2">
            {order.isPriorityShipping ? (
              <Badge variant="outline">Priority (Lux)</Badge>
            ) : null}
            <Badge>{order.status}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Items ({order.items.length})</CardTitle>
              <CardDescription>
                Snapshotted at fulfillment — inventory service is not consulted here
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2"
                >
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.brand ?? "—"} · qty {item.quantity}
                      {item.size ? ` · size ${item.size}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div>{fmtMoney(item.priceInCents * item.quantity)}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtMoney(item.priceInCents)} ea
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Total</div>
                <div>{fmtMoney(order.totalInCents)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Tax</div>
                <div>{fmtMoney(order.taxInCents)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Shipping</div>
                <div>
                  {fmtMoney(order.shippingInCents)}
                  {order.isPriorityShipping ? " (priority)" : ""}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Refunded</div>
                <div>
                  {fmtMoney(refundedInCents)}
                  {order.refundedAt ? ` · ${fmt(order.refundedAt)}` : ""}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shipping address</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {order.shippingLine1 ? (
                <div className="space-y-0.5">
                  <div>{order.shippingName}</div>
                  <div>{order.shippingLine1}</div>
                  {order.shippingLine2 ? <div>{order.shippingLine2}</div> : null}
                  <div>
                    {order.shippingCity}, {order.shippingState} {order.shippingPostalCode}
                  </div>
                  <div>{order.shippingCountry}</div>
                </div>
              ) : (
                <p className="text-muted-foreground">No address on file.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Placed</div>
                <div>{fmt(order.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Shipped</div>
                <div>{fmt(order.shippedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Arrived</div>
                <div>{fmt(order.arrivedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Return started</div>
                <div>{fmt(order.returnInitiatedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Returned</div>
                <div>{fmt(order.returnedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">ETA</div>
                <div>{fmt(order.estimatedDeliveryAt)}</div>
              </div>
            </CardContent>
          </Card>

          {order.customerTeamNotes ? (
            <Card>
              <CardHeader>
                <CardTitle>Customer team notes</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {order.customerTeamNotes}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <OrderActions
            orderId={order.id}
            status={order.status}
            allowedStatuses={allowedStatuses}
            trackingNumber={order.trackingNumber}
            carrier={order.carrier}
            customerTeamNotes={order.customerTeamNotes}
            refundableInCents={refundableInCents}
            refundSoftCapInCents={REFUND_SOFT_CAP_CENTS}
            canRefund={order.source === "DIRECT_SALE" && !!order.stripePaymentIntentId}
          />
          <Link
            href="/admin/orders"
            className={buttonVariants({ variant: "outline" })}
          >
            ← Back to orders
          </Link>
        </div>
      </div>
    </div>
  );
}
