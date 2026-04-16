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

export default async function StylistChatPage({ params }: Props) {
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
  if (session.stylistId !== user.id) notFound();
  if (!CHAT_STATUSES.includes(session.status)) {
    redirect("/stylist/sessions");
  }
  if (!session.twilioChannelSid) redirect("/stylist/sessions");

  const clientName = `${session.client.firstName} ${session.client.lastName}`;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <ChatWindow
        sessionId={session.id}
        currentIdentity={user.clerkId!}
        otherUserName={clientName}
        otherUserAvatar={session.client.avatarUrl}
        sessionStatus={session.status}
        viewerRole="STYLIST"
      />
      <PushPermission />
    </div>
  );
}
