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
import { Separator } from "@/components/ui/separator";
import { getAdminUserDetail } from "@/lib/users/admin.service";
import { UserActions } from "./user-actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString() : "—";
}

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAdminUserDetail(id);
  if (!user) notFound();

  return (
    <div>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        description={user.email}
        actions={
          <>
            <Badge variant="outline">{user.role}</Badge>
            {user.stripeCustomerId ? (
              <Badge variant="outline">Stripe OK</Badge>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>Joined {fmt(user.createdAt)}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Phone</div>
                <div>{user.phone ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Referral code
                </div>
                <div>{user.referralCode}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Last login
                </div>
                <div>{fmt(user.lastLoginAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Loyalty</div>
                <div>{user.loyaltyTier}</div>
              </div>
            </CardContent>
          </Card>

          {user.stylistProfile ? (
            <Card>
              <CardHeader>
                <CardTitle>Stylist profile</CardTitle>
                <CardDescription>
                  {user.stylistProfile.stylistType} ·{" "}
                  {user.stylistProfile.matchEligible
                    ? "match-eligible"
                    : "pending review"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Onboarding
                  </div>
                  <div>{user.stylistProfile.onboardingStatus}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Stripe Connect
                  </div>
                  <div>
                    {user.stylistProfile.stripeConnectId
                      ? "Connected"
                      : "Not connected"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Completed sessions
                  </div>
                  <div>{user.stylistProfile.totalSessionsCompleted}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-muted-foreground">
                    Avg rating
                  </div>
                  <div>{user.stylistProfile.averageRating ?? "—"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs uppercase text-muted-foreground">
                    Director pick
                  </div>
                  <div className="whitespace-pre-wrap">
                    {user.stylistProfile.directorPick ?? (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2">
                  <Separator className="my-2" />
                  <Link
                    href={`/admin/stylists/${user.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Open match-eligibility review →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Sessions</CardTitle>
              <CardDescription>Most recent 10 per role</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {user.clientSessions.length === 0 &&
              user.stylistSessions.length === 0 ? (
                <p className="text-muted-foreground">No sessions yet.</p>
              ) : (
                <div className="space-y-4">
                  {user.clientSessions.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs uppercase text-muted-foreground">
                        As client
                      </div>
                      <ul className="space-y-1">
                        {user.clientSessions.map((s) => (
                          <li key={s.id}>
                            <Link
                              href={`/admin/sessions/${s.id}`}
                              className="hover:underline"
                            >
                              {s.planType} · {s.status} · {fmt(s.createdAt)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {user.stylistSessions.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs uppercase text-muted-foreground">
                        As stylist
                      </div>
                      <ul className="space-y-1">
                        {user.stylistSessions.map((s) => (
                          <li key={s.id}>
                            <Link
                              href={`/admin/sessions/${s.id}`}
                              className="hover:underline"
                            >
                              {s.planType} · {s.status} · {fmt(s.createdAt)}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subscriptions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {user.subscriptions.length === 0 ? (
                <p className="text-muted-foreground">No subscriptions.</p>
              ) : (
                <ul className="space-y-1">
                  {user.subscriptions.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/admin/subscriptions/${s.id}`}
                        className="hover:underline"
                      >
                        {s.planType} · {s.frequency} · {s.status} · renews{" "}
                        {fmt(s.currentPeriodEnd)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <UserActions user={user} />

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>{user.notes.length} total</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {user.notes.length === 0 ? (
                <p className="text-muted-foreground">No notes yet.</p>
              ) : (
                user.notes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-md border border-border bg-muted/40 p-3"
                  >
                    <div className="whitespace-pre-wrap">{n.content}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {fmt(n.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Link
            href="/admin/users"
            className={buttonVariants({ variant: "outline" })}
          >
            ← Back to users
          </Link>
        </div>
      </div>
    </div>
  );
}
