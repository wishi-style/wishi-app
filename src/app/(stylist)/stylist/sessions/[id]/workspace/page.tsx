import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { StylistWorkspace } from "@/components/stylist/workspace";
import { getWorkspaceData } from "@/lib/sessions/workspace-query";

export const dynamic = "force-dynamic";

const CHAT_STATUSES = [
  "ACTIVE",
  "PENDING_END",
  "PENDING_END_APPROVAL",
  "END_DECLINED",
  "COMPLETED",
  "CANCELLED",
];

function planTypeToSessionType(plan: string): "mini" | "major" | "lux" {
  if (plan === "MINI") return "mini";
  if (plan === "MAJOR") return "major";
  return "lux";
}

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
      planType: true,
      twilioChannelSid: true,
      client: {
        select: {
          firstName: true,
          lastName: true,
          avatarUrl: true,
          clerkId: true,
          locations: {
            select: { city: true, country: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!session || session.stylistId !== user.id) notFound();
  if (!CHAT_STATUSES.includes(session.status)) redirect("/stylist/sessions");
  if (!session.twilioChannelSid) redirect("/stylist/sessions");

  const clientName =
    [session.client.firstName, session.client.lastName]
      .filter(Boolean)
      .join(" ") || "Client";
  const loc = session.client.locations[0];
  const clientLocation = loc
    ? [loc.city, loc.country].filter(Boolean).join(", ")
    : null;
  const isClosed =
    session.status === "COMPLETED" || session.status === "CANCELLED";

  const { boards, curated, cart, progress } = await getWorkspaceData(session.id);
  const canRequestEnd =
    session.status === "ACTIVE" || session.status === "PENDING_END";

  return (
    <StylistWorkspace
      sessionId={session.id}
      sessionStatus={session.status}
      sessionType={planTypeToSessionType(session.planType)}
      isClosed={isClosed}
      currentIdentity={user.clerkId!}
      clientName={clientName}
      clientAvatarUrl={session.client.avatarUrl ?? null}
      clientLocation={clientLocation}
      canRequestEnd={canRequestEnd}
      boards={boards}
      curated={curated}
      cart={cart}
      progress={progress}
    />
  );
}
