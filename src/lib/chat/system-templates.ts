// Loveable parity model: the board card itself appearing / flipping is the
// signal for delivery + rating. We do NOT dispatch a stage bubble for those
// events. Templates here are the residual cases — welcome on activation,
// session-end lifecycle, and idle-poke — where there's no associated card to
// carry the meaning.
export enum SystemTemplate {
  WELCOME = "WELCOME",
  END_SESSION_REQUESTED = "END_SESSION_REQUESTED",
  END_SESSION_APPROVED = "END_SESSION_APPROVED",
  END_SESSION_DECLINED = "END_SESSION_DECLINED",
  SESSION_COMPLETED = "SESSION_COMPLETED",
  IDLE_REMINDER = "IDLE_REMINDER",
}

const templates: Record<SystemTemplate, string> = {
  [SystemTemplate.WELCOME]:
    "Hi {{clientFirstName}}, welcome to your {{planType}} session with {{stylistFirstName}}! Your stylist will start by creating a moodboard based on your style preferences.",
  [SystemTemplate.END_SESSION_REQUESTED]:
    "{{requesterFirstName}} has requested to end this session.",
  [SystemTemplate.END_SESSION_APPROVED]:
    "Session end approved. Thank you for styling with Wishi!",
  [SystemTemplate.END_SESSION_DECLINED]:
    "Session end was declined. The session will continue.",
  [SystemTemplate.SESSION_COMPLETED]:
    "This session is now complete. We hope you loved your new looks!",
  [SystemTemplate.IDLE_REMINDER]:
    "It's been a while since your last message. Your stylist is here whenever you're ready!",
};

export function renderSystemTemplate(
  template: SystemTemplate,
  vars: Record<string, string>,
): string {
  let text = templates[template];
  for (const [key, value] of Object.entries(vars)) {
    text = text.replaceAll(`{{${key}}}`, value);
  }
  return text;
}
