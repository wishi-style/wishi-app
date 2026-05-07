import { redirect, notFound } from "next/navigation";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { getSessionById } from "@/lib/sessions/queries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Loveable contract: the session URL IS the room. There is no detail card
 * with a "Continue to Session" gate. We keep this page as a thin redirect so
 * any external links (Klaviyo emails, push notifications, old SMS templates)
 * continue to land users in the chat.
 *
 * Cancelled / reassigned sessions punt to the sessions list — there's no chat
 * to land in.
 */
export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const session = await getSessionById(id);
  if (!session || session.clientId !== user.id) notFound();

  if (session.status === "CANCELLED" || session.status === "REASSIGNED") {
    redirect("/sessions");
  }
  redirect(`/sessions/${id}/chat`);
}
