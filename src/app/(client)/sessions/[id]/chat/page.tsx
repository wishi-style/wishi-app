import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { ChatWindow } from "@/components/chat/chat-window";
import { PushPermission } from "@/components/chat/push-permission";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const CHAT_STATUSES = ["ACTIVE", "PENDING_END", "PENDING_END_APPROVAL", "END_DECLINED"];

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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <ChatWindow
        sessionId={session.id}
        currentIdentity={user.clerkId!}
        otherUserName={stylistName}
        otherUserAvatar={session.stylist?.avatarUrl}
        sessionStatus={session.status}
        viewerRole="CLIENT"
      />
      <PushPermission />
    </div>
  );
}
