import { unauthorized } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanPricesForUi } from "@/lib/plans";
import { SessionCheckoutClient } from "./session-checkout-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ plan?: string; stylistId?: string }>;
}

/**
 * Loveable mounts SessionCheckout at /session-checkout?plan=mini|major|lux.
 * Visible chrome ports verbatim (back link → stylist hero → monthly/one-time
 * frequency toggle → summary with promo code → payment column). The fake
 * locally-collected card form is replaced with a "Pay with Stripe" button
 * that calls the existing `createCheckout` server action — Stripe Hosted
 * Checkout collects the card on stripe.com (PCI SAQ A scope) and redirects
 * back to /bookings/success on success.
 */
export default async function SessionCheckoutPage({ searchParams }: Props) {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const params = await searchParams;
  const planSlug = (params.plan ?? "major").toLowerCase();
  const stylistId = params.stylistId ?? null;

  const planType =
    planSlug === "mini"
      ? "MINI"
      : planSlug === "lux"
        ? "LUX"
        : "MAJOR";

  const prices = await getPlanPricesForUi();
  const priceRow =
    planType === "MINI" ? prices.mini : planType === "LUX" ? prices.lux : prices.major;

  let stylist: {
    id: string;
    firstName: string;
    avatarUrl: string | null;
  } | null = null;
  if (stylistId) {
    const profile = await prisma.stylistProfile.findUnique({
      where: { id: stylistId },
      select: {
        id: true,
        user: { select: { firstName: true, avatarUrl: true } },
      },
    });
    if (profile) {
      stylist = {
        id: profile.id,
        firstName: profile.user.firstName,
        avatarUrl: profile.user.avatarUrl,
      };
    }
  }

  return (
    <SessionCheckoutClient
      stylist={stylist}
      planType={planType}
      planName={
        planType === "MINI" ? "Mini" : planType === "LUX" ? "Lux" : "Major"
      }
      oneTimeDollars={priceRow.displayDollars}
      defaultEmail={user.email ?? ""}
    />
  );
}
