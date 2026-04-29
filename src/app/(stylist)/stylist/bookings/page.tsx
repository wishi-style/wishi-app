import { redirect } from "next/navigation";

// "My bookings" lives in the StylistTopBar's nav. Founder decision
// 2026-04-29: bookings is the dashboard's home — the dashboard already
// surfaces the priority-ranked session queue + filters + chat preview.
// Mirrors the `/stylist/sessions` precedent.
export default function StylistBookingsIndex() {
  redirect("/stylist/dashboard");
}
