export type NotificationType =
  | "booking"
  | "subscription_started"
  | "subscription_reactivated"
  | "message"
  | "looks_purchased"
  | "plan_upgraded"
  | "session_ended"
  | "review"
  | "tip"
  | "favorite_profile"
  | "favorite_look"
  | "session_eligible_to_end"
  | "payout";

export type PlanType = "Essential" | "Premium" | "Lux";

export interface AppNotification {
  id: string;
  type: NotificationType;
  source: "client" | "platform";
  clientName?: string;
  plan?: PlanType;
  title: string;
  body: string;
  amount?: number;
  emoji?: string;
  createdAt: string; // ISO
  read: boolean;
  href: string;
}

const now = Date.now();
const ago = (mins: number) => new Date(now - mins * 60_000).toISOString();

export const mockNotifications: AppNotification[] = [
  {
    id: "n1",
    type: "tip",
    source: "client",
    clientName: "Olivia Bennett",
    plan: "Lux",
    title: "Olivia tipped you $25! 🎉",
    body: "“You absolutely nailed my vacation looks — thank you!”",
    amount: 25,
    emoji: "💸",
    createdAt: ago(4),
    read: false,
    href: "/stylist/dashboard",
  },
  {
    id: "n2",
    type: "booking",
    source: "client",
    clientName: "Mia Carter",
    plan: "Premium",
    title: "New booking from Mia Carter",
    body: "Premium plan · Capsule wardrobe refresh",
    createdAt: ago(22),
    read: false,
    href: "/stylist/dashboard",
  },
  {
    id: "n3",
    type: "message",
    source: "client",
    clientName: "Sophie Lin",
    plan: "Essential",
    title: "New message from Sophie Lin",
    body: "“Could we swap the blazer for something lighter?”",
    createdAt: ago(38),
    read: false,
    href: "/stylist/dashboard",
  },
  {
    id: "n4",
    type: "looks_purchased",
    source: "client",
    clientName: "Ava Reyes",
    plan: "Premium",
    title: "Ava just grabbed 3 more looks! 🛍️✨",
    body: "She loved her last delivery and came back for more.",
    emoji: "🛍️",
    createdAt: ago(55),
    read: false,
    href: "/stylist/dashboard",
  },
  {
    id: "n5",
    type: "plan_upgraded",
    source: "client",
    clientName: "Chloe Park",
    plan: "Lux",
    title: "Chloe upgraded to Lux! 👑",
    body: "Time to bring out the big style guns.",
    emoji: "👑",
    createdAt: ago(90),
    read: true,
    href: "/stylist/dashboard",
  },
  {
    id: "n6",
    type: "subscription_started",
    source: "client",
    clientName: "Hannah Cole",
    plan: "Premium",
    title: "New subscription cycle started",
    body: "Hannah Cole · Premium plan renewed",
    createdAt: ago(150),
    read: true,
    href: "/stylist/dashboard",
  },
  {
    id: "n7",
    type: "subscription_reactivated",
    source: "client",
    clientName: "Isabella Wright",
    plan: "Essential",
    title: "Isabella reactivated her subscription",
    body: "She’s back from a pause — say hi 👋",
    createdAt: ago(210),
    read: true,
    href: "/stylist/dashboard",
  },
  {
    id: "n8",
    type: "session_ended",
    source: "client",
    clientName: "Zoe Martin",
    plan: "Premium",
    title: "Zoe ended her session",
    body: "Wrap up notes and request a review.",
    createdAt: ago(300),
    read: true,
    href: "/stylist/dashboard",
  },
  {
    id: "n9",
    type: "review",
    source: "client",
    clientName: "Lily Adams",
    plan: "Lux",
    title: "New 5★ review from Lily Adams",
    body: "“Best styling experience I’ve ever had.”",
    createdAt: ago(420),
    read: true,
    href: "/stylist/profile",
  },
  {
    id: "n10",
    type: "favorite_profile",
    source: "client",
    clientName: "Emma Russo",
    title: "Emma added you to her favorites ⭐",
    body: "Your profile just got starred.",
    createdAt: ago(720),
    read: true,
    href: "/stylist/profile",
  },
  {
    id: "n11",
    type: "favorite_look",
    source: "client",
    clientName: "Grace Tan",
    title: "Grace favorited one of your looks",
    body: "“Soft tailoring · Spring” saved to her favorites.",
    createdAt: ago(900),
    read: true,
    href: "/stylist/profile",
  },
  {
    id: "n12",
    type: "session_eligible_to_end",
    source: "platform",
    clientName: "Nora Bishop",
    title: "You’re eligible to end the session with Nora Bishop",
    body: "All deliverables met — wrap it up to release payout.",
    createdAt: ago(60),
    read: false,
    href: "/stylist/dashboard",
  },
  {
    id: "n13",
    type: "payout",
    source: "platform",
    title: "Payout sent: $480.00",
    body: "Your weekly payout was transferred to your bank.",
    amount: 480,
    createdAt: ago(1440),
    read: true,
    href: "/stylist/dashboard",
  },
];

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
