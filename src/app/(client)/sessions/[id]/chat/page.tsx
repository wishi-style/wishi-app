import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { SessionWorkspace } from "@/components/session/workspace";
import { SessionHeaderBar } from "@/components/session/session-header-bar";
import { getWorkspaceData } from "@/lib/sessions/workspace-query";
import { PushPermission } from "@/components/chat/push-permission";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const CHAT_STATUSES = [
  "ACTIVE",
  "PENDING_END",
  "PENDING_END_APPROVAL",
  "END_DECLINED",
];

/**
 * Client StylingRoom — chat + styleboards + curated pieces + cart in a
 * single view with a right-rail progress sidebar (viewer.role === CLIENT).
 * Replaces the bare ChatWindow shell with the full Phase 10 workspace
 * layout so all session-scoped surfaces are one click away.
 */
export default async function ClientChatPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      status: true,
      twilioChannelSid: true,
      stylist: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          clerkId: true,
        },
      },
    },
  });

  if (!session) notFound();
  if (session.clientId !== user.id) notFound();
  if (!CHAT_STATUSES.includes(session.status)) redirect(`/sessions/${id}`);
  if (!session.twilioChannelSid) redirect(`/sessions/${id}`);

  const stylistName = session.stylist
    ? `${session.stylist.firstName} ${session.stylist.lastName}`
    : "Your Stylist";

  const { boards, curated, cart, progress } = await getWorkspaceData(
    session.id,
    user.id,
  );

  const planLabel =
    progress.planType === "MINI"
      ? "Mini"
      : progress.planType === "MAJOR"
        ? "Major"
        : progress.planType === "LUX"
          ? "Lux"
          : null;

  return (
    <>
      <SessionHeaderBar
        stylistName={stylistName}
        stylistAvatarUrl={session.stylist?.avatarUrl ?? null}
        planLabel={planLabel}
      />
      <SessionWorkspace
        heightClass="h-[calc(100vh-7.5rem)]"
        sessionId={session.id}
        currentIdentity={user.clerkId!}
        otherUserName={stylistName}
        otherUserAvatar={session.stylist?.avatarUrl ?? null}
        sessionStatus={session.status}
        viewerRole="CLIENT"
        boards={boards}
        curated={curated}
        cart={cart}
        progress={progress}
      />
      <PushPermission />
    </>
  );
}
