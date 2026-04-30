import Link from "next/link";
import Image from "next/image";

interface SessionData {
  id: string;
  planType: string;
  status: string;
  amountPaidInCents: number;
  createdAt: Date;
  twilioChannelSid: string | null;
  stylist: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    stylistProfile: { id: string } | null;
  } | null;
  messages: { text: string | null; createdAt: Date; kind: string }[];
  boards: { id: string; type: string }[];
}

type CardStatus =
  | "new_board"
  | "awaiting_reply"
  | "in_progress"
  | "completed"
  | "booked"
  | "closed";

const planLabel: Record<string, string> = {
  MINI: "Mini",
  MAJOR: "Major",
  LUX: "Lux",
};

const planBadgeClass = (plan: string) =>
  plan === "LUX"
    ? "bg-warm-beige text-dark-taupe"
    : "bg-secondary text-secondary-foreground";

function deriveStatus(session: SessionData): CardStatus {
  if (session.boards.length > 0) return "new_board";
  // Only an explicit stylist end-request (PENDING_END_APPROVAL) routes to
  // the end-session flow. PENDING_END is a worker-set "stale" hint that
  // doesn't yet allow approveEnd to fire — keep it in_progress so the
  // card lands in chat instead of a 409 from /end-session.
  if (session.status === "PENDING_END_APPROVAL") return "awaiting_reply";
  if (session.status === "BOOKED") return "booked";
  if (
    session.status === "ACTIVE" ||
    session.status === "PENDING_END" ||
    session.status === "END_DECLINED"
  ) {
    return "in_progress";
  }
  if (session.status === "COMPLETED") return "completed";
  // CANCELLED / FROZEN / REASSIGNED — terminal-or-paused but not a happy
  // path. Don't surface a "Book again" CTA; the detail page is the right
  // landing spot.
  return "closed";
}

function actionLabel(status: CardStatus, stylistFirstName: string): string {
  switch (status) {
    case "new_board":
      return "Review Style Board";
    case "awaiting_reply":
      return "Approve End";
    case "in_progress":
      return "View Session";
    case "booked":
      return "Continue";
    case "completed":
      return `Book ${stylistFirstName} Again`;
    case "closed":
      return "View Details";
  }
}

function formatRelativeTime(dateStr: Date): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function messagePreview(session: SessionData): string {
  const latest = session.messages[0];
  if (latest?.text) return latest.text;
  if (latest?.kind === "MOODBOARD") return "Sent you a moodboard.";
  if (latest?.kind === "STYLEBOARD") return "Sent you a style board.";
  switch (session.status) {
    case "BOOKED":
      return "Booked — your stylist will reach out shortly.";
    case "COMPLETED":
      return "Session completed.";
    case "CANCELLED":
      return "Session cancelled.";
    case "FROZEN":
      return "Session paused.";
    case "REASSIGNED":
      return "Reassigned to another stylist.";
    case "PENDING_END_APPROVAL":
      return "Your stylist requested to wrap up.";
    default:
      return "Session in progress.";
  }
}

function actionHref(status: CardStatus, session: SessionData): string {
  switch (status) {
    case "new_board":
    case "in_progress":
    case "booked":
      // §3.4: skip the /sessions/[id] redirect hop and link straight to the
      // chat (StylingRoom) when there's a real Twilio channel. For BOOKED
      // sessions before a channel is provisioned the detail page is the
      // right fallback.
      return session.twilioChannelSid
        ? `/sessions/${session.id}/chat`
        : `/sessions/${session.id}`;
    case "awaiting_reply":
      return `/sessions/${session.id}/end-session`;
    case "completed":
      return session.stylist?.stylistProfile
        ? `/stylists/${session.stylist.stylistProfile.id}`
        : `/sessions/${session.id}`;
    case "closed":
      return `/sessions/${session.id}`;
  }
}

export function SessionCard({ session }: { session: SessionData }) {
  const stylistName = session.stylist
    ? `${session.stylist.firstName} ${session.stylist.lastName}`.trim()
    : "Finding stylist...";
  const firstName = session.stylist?.firstName ?? "Stylist";
  const initials = stylistName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const status = deriveStatus(session);
  const isHighPriority = status === "new_board";
  const lastTimestamp = session.messages[0]?.createdAt ?? session.createdAt;

  const stylistProfileHref = session.stylist?.stylistProfile?.id
    ? `/stylists/${session.stylist.stylistProfile.id}`
    : null;

  return (
    <div
      className={`group flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 rounded-sm bg-card p-4 sm:p-6 transition-all hover:shadow-md ${
        isHighPriority ? "border-l-2 border-l-warm-beige" : ""
      }`}
    >
      <div className="flex items-center gap-3 sm:contents">
        {stylistProfileHref ? (
          <Link
            href={stylistProfileHref}
            className="shrink-0 transition-opacity hover:opacity-80"
            aria-label={`View ${stylistName}'s profile`}
          >
            <SessionAvatar
              stylistName={stylistName}
              avatarUrl={session.stylist?.avatarUrl ?? null}
              initials={initials}
            />
          </Link>
        ) : (
          <SessionAvatar
            stylistName={stylistName}
            avatarUrl={session.stylist?.avatarUrl ?? null}
            initials={initials}
          />
        )}
        <div className="sm:hidden">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg">{stylistName}</h3>
            <span
              className={`rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${planBadgeClass(
                session.planType,
              )}`}
            >
              {planLabel[session.planType] ?? session.planType}
            </span>
          </div>
          <p className="text-sm text-taupe">{formatRelativeTime(lastTimestamp)}</p>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="hidden items-center gap-3 sm:flex">
          <h3 className="font-display text-xl">{stylistName}</h3>
          <span
            className={`rounded-sm px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${planBadgeClass(
              session.planType,
            )}`}
          >
            {planLabel[session.planType] ?? session.planType}
          </span>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground sm:max-w-lg sm:text-base">
          {messagePreview(session)}
        </p>
        <p className="hidden text-sm text-taupe sm:block">
          {formatRelativeTime(lastTimestamp)}
        </p>
      </div>

      <Link
        href={actionHref(status, session)}
        className={`shrink-0 rounded-sm px-8 py-2.5 text-xs font-body tracking-widest transition-colors ${
          isHighPriority
            ? "bg-foreground text-background hover:bg-foreground/90"
            : "border border-input text-foreground hover:bg-accent hover:text-accent-foreground"
        }`}
      >
        {actionLabel(status, firstName)}
      </Link>
    </div>
  );
}

function SessionAvatar({
  stylistName,
  avatarUrl,
  initials,
}: {
  stylistName: string;
  avatarUrl: string | null;
  initials: string;
}) {
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-secondary sm:h-20 sm:w-20">
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={stylistName}
          fill
          sizes="(min-width: 640px) 80px, 56px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display text-xl text-secondary-foreground">
          {initials || "—"}
        </div>
      )}
    </div>
  );
}
