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
import { getAdminStylistDetail } from "@/lib/stylists/admin.service";
import { StylistReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toLocaleString() : "—";
}

export default async function AdminStylistDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAdminStylistDetail(id);
  if (!user || !user.stylistProfile) notFound();

  const profile = user.stylistProfile;

  return (
    <div>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        description={user.email}
        actions={
          <>
            <Badge variant="outline">
              {profile.stylistType.replace("_", "-")}
            </Badge>
            {profile.matchEligible ? (
              <Badge>Match-eligible</Badge>
            ) : (
              <Badge variant="outline">Pending review</Badge>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Onboarding</CardTitle>
              <CardDescription>
                {profile.onboardingStatus.replace(/_/g, " ").toLowerCase()} ·
                step {profile.onboardingStep}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Completed
                </div>
                <div>{fmt(profile.onboardingCompletedAt)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Stripe Connect
                </div>
                <div>
                  {profile.stripeConnectId ? "Connected" : "Not connected"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Eligibility set
                </div>
                <div>
                  {fmt(profile.matchEligibleSetAt)}
                  {profile.matchEligibleSetBy
                    ? ` by ${profile.matchEligibleSetBy}`
                    : ""}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Years experience
                </div>
                <div>{profile.yearsExperience ?? "—"}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Philosophy</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="whitespace-pre-wrap">
                {profile.philosophy ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bio</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="whitespace-pre-wrap">
                {profile.bio ?? (
                  <span className="text-muted-foreground">—</span>
                )}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expertise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Style specialties
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profile.styleSpecialties.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    profile.styleSpecialties.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Body specialties
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profile.bodySpecialties.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    profile.bodySpecialties.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Gender preference
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profile.genderPreference.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    profile.genderPreference.map((g) => (
                      <Badge key={g} variant="outline">
                        {g}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">
                  Budget brackets
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {profile.budgetBrackets.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    profile.budgetBrackets.map((b) => (
                      <Badge key={b} variant="outline">
                        {b}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {profile.profileBoards.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Featured looks</CardTitle>
                <CardDescription>
                  {profile.profileBoards.length} board
                  {profile.profileBoards.length === 1 ? "" : "s"}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                <ul className="space-y-1">
                  {profile.profileBoards.map((b) => (
                    <li key={b.id} className="font-mono text-xs">
                      {b.id.slice(0, 10)}… · {b.profileStyle ?? "—"}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <StylistReviewActions
            stylistUserId={user.id}
            matchEligible={profile.matchEligible}
            waitlistCount={profile.waitlistEntries.length}
          />
          <Link
            href="/admin/stylists"
            className={buttonVariants({ variant: "outline" })}
          >
            ← Back to stylists
          </Link>
        </div>
      </div>
    </div>
  );
}
