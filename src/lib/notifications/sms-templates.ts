import type { DispatchInput, NotificationEvent } from "./dispatcher";
import { NOTIFICATION_EVENT_META } from "./event-meta";

interface RecipientCtx {
  firstName: string | null;
}

type TemplateFn = (input: DispatchInput, recipient: RecipientCtx) => string | null;

const dollars = (cents: unknown): string | null => {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

const TEMPLATES: Partial<Record<NotificationEvent, TemplateFn>> = {
  "tip.received": (input) => {
    const amount = dollars(input.emailProperties?.tipInCents);
    const from = str(input.emailProperties?.firstName);
    if (!amount || !from || !input.url) return null;
    return `Wishi: ${from} tipped you $${amount} 🎉 ${input.url}`;
  },

  "session.booked": (input) => {
    const planName = str(input.emailProperties?.planName) ?? "new";
    const from = str(input.emailProperties?.firstName) ?? "a client";
    if (!input.url) return null;
    return `Wishi: New ${planName} booking from ${from}. ${input.url}`;
  },

  "session.activated": (input) => {
    const from = str(input.emailProperties?.firstName) ?? "Your client";
    if (!input.url) return null;
    return `Wishi: ${from} just messaged you. Start styling: ${input.url}`;
  },

  "session.overdue": (input) => {
    const from = str(input.emailProperties?.firstName) ?? "Your client";
    if (!input.url) return null;
    return `Wishi: Reminder — ${from} is waiting on you. ${input.url}`;
  },

  "payout.completed": (input) => {
    const amount = dollars(input.emailProperties?.amountInCents);
    if (!amount) return null;
    return `Wishi: Payout of $${amount} sent to your bank ✓`;
  },

  "order.shipped": (input) => {
    if (!input.url) return null;
    return `Wishi: Your order has shipped 📦 Track it: ${input.url}`;
  },

  "order.arrived": (input) => {
    if (!input.url) return null;
    return `Wishi: Your order arrived. 14 days to return anything: ${input.url}`;
  },

  "subscription.retry_failed": (input) => {
    if (!input.url) return null;
    return `Wishi: We couldn't bill your subscription. Update payment: ${input.url}`;
  },
};

export function renderSmsBody(
  input: DispatchInput,
  recipient: RecipientCtx,
): string | null {
  if (!NOTIFICATION_EVENT_META[input.event]?.smsEnabled) return null;
  const fn = TEMPLATES[input.event];
  if (!fn) return null;
  return fn(input, recipient);
}
