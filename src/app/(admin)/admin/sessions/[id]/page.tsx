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
  getAdminSessionDetail,
  listEligibleStylistsForReassign,
} from "@/lib/admin/sessions.service";
import { SessionActions } from "./session-actions";

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

export default async function AdminSessionDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getAdminSessionDetail(id);
  if (!session) notFound();

  const candidates = await listEligibleStylistsForReassign(session.stylistId);

  return (
    <div>
      <PageHeader
        title={`Session ${session.id.slice(0, 10)}…`}
        description={`${session.planType} · ${session.client.firstName} ${session.client.lastName}${
          session.stylist
            ? ` → ${session.stylist.firstName} ${session.stylist.lastName}`
            : ""
        }`}
        actions={<Badge>{session.status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Booked</div>
                <div>{fmt(session.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Started</div>
                <div>{fmt(session.startedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  End requested
                </div>
                <div>{fmt(session.endRequestedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Completed</div>
                <div>{fmt(session.completedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Amount paid
                </div>
                <div>{fmtMoney(session.amountPaidInCents)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Tip</div>
                <div>{fmtMoney(session.tipInCents)}</div>
              </div>
              {session.frozenAt ? (
                <div className="col-span-2">
                  <div className="text-xs uppercase text-muted-foreground">Frozen</div>
                  <div>
                    {fmt(session.frozenAt)} — {session.frozenReason ?? "no reason given"}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Match history</CardTitle>
              <CardDescription>{session.matchHistory.length} entries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {session.matchHistory.length === 0 ? (
                <p className="text-muted-foreground">Not yet matched.</p>
              ) : (
                session.matchHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-md border border-border bg-muted/30 p-2 text-xs"
                  >
                    <div className="font-mono">{h.stylistId}</div>
                    <div className="text-muted-foreground">
                      matched {fmt(h.matchedAt)}
                      {h.unmatchedAt ? ` · unmatched ${fmt(h.unmatchedAt)}` : ""}
                      {h.reason ? ` · ${h.reason}` : ""}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pending actions</CardTitle>
              <CardDescription>
                {session.pendingActions.length} entries
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {session.pendingActions.length === 0 ? (
                <p className="text-muted-foreground">None.</p>
              ) : (
                session.pendingActions.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-2 text-xs"
                  >
                    <div>
                      <div className="font-medium">{a.type}</div>
                      <div className="text-muted-foreground">
                        due {fmt(a.dueAt)}
                        {a.resolvedAt ? ` · resolved ${fmt(a.resolvedAt)}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline">{a.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>{session.payments.length} entries</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {session.payments.length === 0 ? (
                <p className="text-muted-foreground">None.</p>
              ) : (
                session.payments.map((p) => (
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
          <SessionActions
            sessionId={session.id}
            status={session.status}
            candidates={candidates}
          />
          <Link
            href="/admin/sessions"
            className={buttonVariants({ variant: "outline" })}
          >
            ← Back to sessions
          </Link>
        </div>
      </div>
    </div>
  );
}
