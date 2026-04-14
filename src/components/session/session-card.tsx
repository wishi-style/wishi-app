import Link from "next/link";

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

const statusColors: Record<string, string> = {
  BOOKED: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PENDING_END: "bg-blue-100 text-blue-700",
  PENDING_END_APPROVAL: "bg-blue-100 text-blue-700",
  END_DECLINED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-stone-100 text-stone-600",
  FROZEN: "bg-red-100 text-red-700",
  REASSIGNED: "bg-stone-100 text-stone-600",
  CANCELLED: "bg-stone-100 text-stone-500",
};

export function SessionCard({ session }: { session: SessionData }) {
  const stylistName = session.stylist
    ? `${session.stylist.firstName} ${session.stylist.lastName}`
    : "Finding stylist...";

  return (
    <Link
      href={`/sessions/${session.id}`}
      className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-5 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-stone-200">
          {session.stylist?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.stylist.avatarUrl}
              alt={stylistName}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
              {stylistName.charAt(0)}
            </div>
          )}
        </div>
        <div>
          <p className="font-medium text-stone-800">{session.planType} Session</p>
          <p className="text-sm text-stone-500">{stylistName}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[session.status] ?? "bg-stone-100 text-stone-600"}`}
        >
          {statusLabels[session.status] ?? session.status}
        </span>
      </div>
    </Link>
  );
}
