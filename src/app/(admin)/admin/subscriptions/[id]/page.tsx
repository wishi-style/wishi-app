import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getAdminSubscriptionDetail } from "@/lib/admin/subscriptions.service";
import { SubscriptionActions } from "./subscription-actions";

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

export default async function AdminSubscriptionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAdminSubscriptionDetail(id);
  if (!result) notFound();
  const { subscription, payments } = result;

  return (
    <div>
      <PageHeader
        title={`${subscription.planType} · ${subscription.frequency}`}
        description={`${subscription.user.firstName} ${subscription.user.lastName} · ${subscription.user.email}`}
        actions={<Badge>{subscription.status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lifecycle</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Created</div>
                <div>{fmt(subscription.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Trial ends
                </div>
                <div>{fmt(subscription.trialEndsAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Period start
                </div>
                <div>{fmt(subscription.currentPeriodStart)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Period end
                </div>
                <div>{fmt(subscription.currentPeriodEnd)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Paused until
                </div>
                <div>{fmt(subscription.pausedUntil)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Cancel requested
                </div>
                <div>{fmt(subscription.cancelRequestedAt)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs uppercase text-muted-foreground">
                  Stripe subscription
                </div>
                <div className="font-mono text-xs">
                  {subscription.stripeSubscriptionId}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payment history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {payments.length === 0 ? (
                <p className="text-muted-foreground">No payments yet.</p>
              ) : (
                payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2 text-xs"
                  >
                    <div>
                      <div className="font-medium">
                        {p.type} · {fmtMoney(p.amountInCents)}
                      </div>
                      <div className="text-muted-foreground">{fmt(p.createdAt)}</div>
                    </div>
                    <Badge variant={p.status === "SUCCEEDED" ? "default" : "outline"}>
                      {p.status}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <SubscriptionActions
            subscriptionId={subscription.id}
            status={subscription.status}
            isCancelScheduled={Boolean(subscription.cancelRequestedAt)}
          />
          <Link
            href="/admin/subscriptions"
            className={buttonVariants({ variant: "outline" })}
          >
            ← Back to subscriptions
          </Link>
        </div>
      </div>
    </div>
  );
}
