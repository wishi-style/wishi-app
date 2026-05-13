export type CardStatus =
  | "new_board"
  | "awaiting_reply"
  | "in_progress"
  | "completed"
  | "booked"
  | "terminal";

export interface SessionCardInput {
  id: string;
  status: string;
  stylist: {
    firstName: string;
    stylistProfile: { id: string } | null;
  } | null;
  messages: { text: string | null; kind: string }[];
  boards: { id: string; type: string; isRevision?: boolean }[];
}

export function deriveStatus(session: SessionCardInput): CardStatus {
  // Terminal status wins over any unrated-board hint. Chats are closed once
  // a session ends, so the card MUST NOT route the user back into board
  // review / chat / etc. — the only forward motion is to rebook.
  if (
    session.status === "COMPLETED" ||
    session.status === "CANCELLED" ||
    session.status === "FROZEN" ||
    session.status === "REASSIGNED"
  ) {
    return "terminal";
  }
  if (session.boards.length > 0) return "new_board";
  if (session.status === "PENDING_END_APPROVAL") return "awaiting_reply";
  if (session.status === "BOOKED") return "booked";
  if (
    session.status === "ACTIVE" ||
    session.status === "PENDING_END" ||
    session.status === "END_DECLINED"
  ) {
    return "in_progress";
  }
  // Unknown forward state — keep the card in chat.
  return "in_progress";
}

export function actionLabel(
  status: CardStatus,
  session: SessionCardInput,
  stylistFirstName: string,
): string {
  switch (status) {
    case "new_board": {
      const board = session.boards[0];
      if (board?.type === "MOODBOARD") return "Review Moodboard";
      if (board?.isRevision) return "Review Revised Look";
      return "Review Styleboard";
    }
    case "awaiting_reply":
      return "Approve End";
    case "in_progress":
      return "Open Chat";
    case "booked":
      return "Continue";
    case "completed":
      return `Book ${stylistFirstName} Again`;
    case "terminal":
      return `Rebook ${stylistFirstName}`;
  }
}

export function actionHref(status: CardStatus, session: SessionCardInput): string {
  switch (status) {
    case "new_board":
    case "in_progress":
    case "booked":
      return `/sessions/${session.id}/chat`;
    case "awaiting_reply":
      return `/sessions/${session.id}/end-session`;
    case "completed":
      return session.stylist?.stylistProfile
        ? `/stylists/${session.stylist.stylistProfile.id}`
        : `/sessions/${session.id}`;
    case "terminal":
      return session.stylist?.stylistProfile
        ? `/stylists/${session.stylist.stylistProfile.id}`
        : `/stylists`;
  }
}

export function messagePreview(session: SessionCardInput): string {
  // Terminal sessions show a neutral status blurb regardless of any
  // lingering chat history. The most recent message can otherwise read
  // like the session is still in motion ("Matthew loved the moodboard...")
  // even after cancel.
  switch (session.status) {
    case "COMPLETED":
      return "Session completed.";
    case "CANCELLED":
      return "Session cancelled.";
    case "FROZEN":
      return "Session frozen.";
    case "REASSIGNED":
      return "Session reassigned.";
  }
  const latest = session.messages[0];
  if (latest?.text) return latest.text;
  if (latest?.kind === "MOODBOARD") return "Sent you a moodboard.";
  if (latest?.kind === "STYLEBOARD") return "Sent you a style board.";
  switch (session.status) {
    case "BOOKED":
      return "Booked — your stylist will reach out shortly.";
    case "PENDING_END_APPROVAL":
      return "Your stylist requested to wrap up.";
    default:
      return "Session in progress.";
  }
}
