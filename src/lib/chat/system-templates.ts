export enum SystemTemplate {
  WELCOME = "WELCOME",
  SESSION_ACTIVATED = "SESSION_ACTIVATED",
  MOODBOARD_DELIVERED = "MOODBOARD_DELIVERED",
  STYLEBOARD_DELIVERED = "STYLEBOARD_DELIVERED",
  RESTYLE_REQUESTED = "RESTYLE_REQUESTED",
  END_SESSION_REQUESTED = "END_SESSION_REQUESTED",
  END_SESSION_APPROVED = "END_SESSION_APPROVED",
  END_SESSION_DECLINED = "END_SESSION_DECLINED",
  SESSION_COMPLETED = "SESSION_COMPLETED",
  IDLE_REMINDER = "IDLE_REMINDER",
}

const templates: Record<SystemTemplate, string> = {
  [SystemTemplate.WELCOME]:
    "Hi {{clientFirstName}}, welcome to your {{planType}} session with {{stylistFirstName}}! Your stylist will start by creating a moodboard based on your style preferences.",
  [SystemTemplate.SESSION_ACTIVATED]:
    "Your session is now active. {{stylistFirstName}} is ready to start styling!",
  [SystemTemplate.MOODBOARD_DELIVERED]:
    "{{stylistFirstName}} shared a moodboard with you. Take a look and let them know what you think!",
  [SystemTemplate.STYLEBOARD_DELIVERED]:
    "{{stylistFirstName}} created a styleboard for you. Review the looks and share your feedback.",
  [SystemTemplate.RESTYLE_REQUESTED]:
    "{{clientFirstName}} requested a restyle. Check their feedback and create a revised board.",
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
