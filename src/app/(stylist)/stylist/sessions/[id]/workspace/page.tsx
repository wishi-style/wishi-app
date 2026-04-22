import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { SessionWorkspace } from "@/components/session/workspace";
import { getWorkspaceData } from "@/lib/sessions/workspace-query";
import Link from "next/link";
import { StylistEndSessionButton } from "./end-button";

export const dynamic = "force-dynamic";

const CHAT_STATUSES = [
  "ACTIVE",
  "PENDING_END",
  "PENDING_END_APPROVAL",
  "END_DECLINED",
];

export default async function StylistWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      stylistId: true,
      status: true,
      twilioChannelSid: true,
      client: {
        select: { firstName: true, lastName: true, avatarUrl: true, clerkId: true },
      },
    },
  });
  if (!session || session.stylistId !== user.id) notFound();
  if (!CHAT_STATUSES.includes(session.status)) redirect("/stylist/sessions");
  if (!session.twilioChannelSid) redirect("/stylist/sessions");

  const clientName = `${session.client.firstName} ${session.client.lastName}`;
  const { boards, curated, cart, progress } = await getWorkspaceData(session.id);
  const canRequestEnd =
    session.status === "ACTIVE" || session.status === "PENDING_END";

  return (
    <>
      <div className="flex items-center justify-between border-b bg-stone-50 px-6 py-3">
        <div className="flex gap-3 text-sm">
          <Link
            href={`/stylist/sessions/${session.id}/moodboards/new`}
            className="rounded-full border px-4 py-1.5 hover:bg-foreground hover:text-background"
          >
            Build Moodboard
          </Link>
          <Link
            href={`/stylist/sessions/${session.id}/styleboards/new`}
            className="rounded-full border px-4 py-1.5 hover:bg-foreground hover:text-background"
          >
            Build Styleboard
          </Link>
        </div>
        {canRequestEnd && <StylistEndSessionButton sessionId={session.id} />}
      </div>
      <SessionWorkspace
        sessionId={session.id}
        currentIdentity={user.clerkId!}
        otherUserName={clientName}
        otherUserAvatar={session.client.avatarUrl ?? null}
        sessionStatus={session.status}
        viewerRole="STYLIST"
        boards={boards}
        curated={curated}
        cart={cart}
        progress={progress}
      />
    </>
  );
}
