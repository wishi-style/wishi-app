import Link from "next/link";
import Image from "next/image";

interface SessionData {
  id: string;
  planType: string;
  status: string;
  amountPaidInCents: number;
  createdAt: Date;
  stylist: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  } | null;
}

const statusLabels: Record<string, string> = {
  BOOKED: "Booked",
  ACTIVE: "Active",
  PENDING_END: "Wrapping Up",
  PENDING_END_APPROVAL: "Awaiting Approval",
  END_DECLINED: "Continuing",
  COMPLETED: "Completed",
  FROZEN: "Frozen",
  REASSIGNED: "Reassigned",
  CANCELLED: "Cancelled",
};

const statusTone: Record<string, string> = {
  BOOKED: "bg-warm-beige text-dark-taupe",
  ACTIVE: "bg-accent/15 text-accent",
  PENDING_END: "bg-secondary text-secondary-foreground",
  PENDING_END_APPROVAL: "bg-secondary text-secondary-foreground",
  END_DECLINED: "bg-warm-beige text-dark-taupe",
  COMPLETED: "bg-muted text-muted-foreground",
  FROZEN: "bg-burgundy/10 text-burgundy",
  REASSIGNED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function SessionCard({ session }: { session: SessionData }) {
  const stylistName = session.stylist
    ? `${session.stylist.firstName} ${session.stylist.lastName}`.trim()
    : "Finding stylist...";

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="flex items-center justify-between rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-center gap-4">
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-muted">
          {session.stylist?.avatarUrl ? (
            <Image
              src={session.stylist.avatarUrl}
              alt={stylistName}
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              {stylistName.charAt(0)}
            </div>
          )}
        </div>
        <div>
          <p className="font-display text-base">{session.planType} Session</p>
          <p className="text-sm text-muted-foreground">{stylistName}</p>
        </div>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          statusTone[session.status] ?? "bg-muted text-muted-foreground"
        }`}
      >
        {statusLabels[session.status] ?? session.status}
      </span>
    </Link>
  );
}
