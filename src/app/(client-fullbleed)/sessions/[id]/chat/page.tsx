import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { SessionWorkspace } from "@/components/session/workspace";
import { getWorkspaceData } from "@/lib/sessions/workspace-query";
import { PushPermission } from "@/components/chat/push-permission";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const CHAT_STATUSES = [
  "INQUIRY",
  "ACTIVE",
  "PENDING_END",
  "PENDING_END_APPROVAL",
  "END_DECLINED",
];

/**
 * Client StylingRoom — chat + styleboards + curated pieces + cart in a
 * single view with a left-rail progress sidebar (viewer.role === CLIENT).
 * INQUIRY sessions render a chat-only shell with a "Book {firstName}"
 * CTA in place of Buy Looks / Upgrade Plan, mirroring Loveable's
 * `StylingRoom` inquiry contract.
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
          stylistProfile: { select: { id: true } },
          locations: {
            where: { isPrimary: true },
            select: { city: true, state: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!session) notFound();
  if (session.clientId !== user.id) notFound();
  if (!CHAT_STATUSES.includes(session.status)) redirect(`/sessions/${id}`);
  if (!session.twilioChannelSid) redirect(`/sessions/${id}`);

  // Forward-compat: INQUIRY isn't in the SessionStatus enum yet — see the
  // schema. Cast for the comparison so the inquiry-shell code path is wired
  // and ready for the day the enum is extended + the contact-stylist entry
  // point lands. Until then, this branch is dead code on production data.
  const isInquiry = (session.status as string) === "INQUIRY";

  // Style-quiz hard gate: paid sessions only. Inquiries are pre-purchase
  // chats (Loveable-equivalent of the contact flow) and shouldn't push the
  // quiz before the client has even decided to book.
  if (!isInquiry) {
    const styleProfile = await prisma.styleProfile.findUnique({
      where: { userId: user.id },
      select: { quizCompletedAt: true },
    });
    if (!styleProfile?.quizCompletedAt) {
      redirect(`/sessions/${id}/style-quiz`);
    }
  }

  const stylistName = session.stylist
    ? `${session.stylist.firstName} ${session.stylist.lastName}`
    : "Your Stylist";
  const stylistProfileId = session.stylist?.stylistProfile?.id ?? null;
  const bookCtaHref = stylistProfileId
    ? `/bookings/new?stylistId=${stylistProfileId}`
    : null;
  const stylistLocation = (() => {
    const loc = session.stylist?.locations[0];
    if (!loc) return null;
    if (loc.city && loc.state) return `${loc.city}, ${loc.state}`;
    return loc.city ?? loc.state ?? null;
  })();

  const { boards, curated, cart, progress } = await getWorkspaceData(
    session.id,
    user.id,
  );

  return (
    <>
      <SessionWorkspace
        sessionId={session.id}
        currentIdentity={user.clerkId!}
        otherUserName={stylistName}
        otherUserAvatar={session.stylist?.avatarUrl ?? null}
        otherUserLocation={stylistLocation}
        sessionStatus={session.status}
        viewerRole="CLIENT"
        boards={boards}
        curated={curated}
        cart={cart}
        progress={progress}
        stylistProfileId={stylistProfileId}
        bookCtaHref={bookCtaHref}
        stylistFirstName={session.stylist?.firstName ?? null}
      />
      <PushPermission />
    </>
  );
}
