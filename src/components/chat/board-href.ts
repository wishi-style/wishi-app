import type { ViewerRole } from "./message-renderers";

type BoardMessageKind = "MOODBOARD" | "STYLEBOARD" | "RESTYLE";

// Stylists see these boards in `/stylist/sessions/...` (the `(client)` route
// group gates on `requireRole("CLIENT", "ADMIN")`, so a stylist who follows
// the client URL from their chat bubble lands on Access denied).
export function boardMessageHref(opts: {
  kind: BoardMessageKind;
  sessionId: string;
  boardId: string | null;
  viewerRole: ViewerRole;
}): string | null {
  const { kind, sessionId, boardId, viewerRole } = opts;
  if (!boardId) return null;

  const base = viewerRole === "STYLIST" ? `/stylist/sessions/${sessionId}` : `/sessions/${sessionId}`;
  // Restyles are just revision styleboards — same viewer.
  const segment = kind === "MOODBOARD" ? "moodboards" : "styleboards";
  return `${base}/${segment}/${boardId}`;
}
