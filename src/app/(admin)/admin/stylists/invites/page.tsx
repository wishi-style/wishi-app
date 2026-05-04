import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listStylistInvitations } from "@/lib/stylists/invite.service";
import { RevokeInvitationButton } from "./revoke-invitation-button";

export const dynamic = "force-dynamic";

const statusBadgeVariant: Record<
  string,
  "default" | "outline" | "secondary" | "destructive"
> = {
  pending: "default",
  accepted: "secondary",
  revoked: "outline",
  expired: "outline",
};

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default async function StylistInvitationsPage() {
  const invitations = await listStylistInvitations();
  const pendingCount = invitations.filter((i) => i.status === "pending").length;

  return (
    <div>
      <PageHeader
        title="Stylist invitations"
        description={`${invitations.length} total · ${pendingCount} pending`}
        actions={
          <Link
            href="/admin/stylists"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to stylists
          </Link>
        }
      />

      {invitations.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No invitations yet. Invite a stylist from the{" "}
          <Link href="/admin/stylists" className="underline">
            stylists list
          </Link>
          .
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" data-testid="invitations-table">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Sent</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t"
                  data-testid={`invitation-row-${inv.id}`}
                  data-email={inv.emailAddress}
                  data-status={inv.status}
                >
                  <td className="px-4 py-3 font-medium">{inv.emailAddress}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {inv.stylistType.replace("_", "-")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusBadgeVariant[inv.status] ?? "outline"}>
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(inv.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(inv.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.status === "pending" ? (
                      <RevokeInvitationButton
                        invitationId={inv.id}
                        emailAddress={inv.emailAddress}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
