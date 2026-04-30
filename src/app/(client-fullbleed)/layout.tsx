import { requireRole } from "@/lib/auth";

/**
 * Full-bleed sibling of (client). Used for routes whose Loveable contract
 * is a screen-takeover with sidebar nav (StylingRoom, PostSessionFlow,
 * StyleQuiz). The global SiteHeader is suppressed; the page owns its own
 * back affordance.
 */
export default async function ClientFullbleedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole("CLIENT");

  return <div className="min-h-screen bg-background">{children}</div>;
}
