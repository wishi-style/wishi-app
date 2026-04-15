"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createOneTimeCheckout, createSubscriptionCheckout } from "@/lib/payments/checkout";
import { hasActiveSessionWithStylist } from "@/lib/sessions/queries";
import type { PlanType } from "@/generated/prisma/client";
import { resolveAppUrl } from "@/lib/app-url";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function createCheckout(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) throw new Error("User not found");

  const planType = formData.get("planType") as PlanType;
  const stylistProfileId = (formData.get("stylistId") as string) || undefined;
  const isSubscription = formData.get("isSubscription") === "true";

  if (!planType || !["MINI", "MAJOR", "LUX"].includes(planType)) {
    throw new Error("Invalid plan type");
  }

  if (isSubscription && planType === "LUX") {
    throw new Error("Lux plan is one-time only");
  }

  // Validate the stylist profile exists and resolve to a user id
  let stylistUserId: string | undefined;
  if (stylistProfileId) {
    const profile = await prisma.stylistProfile.findUnique({
      where: { id: stylistProfileId },
      select: { userId: true },
    });
    if (!profile) {
      throw new Error("Stylist not found");
    }
    stylistUserId = profile.userId;

    const hasActive = await hasActiveSessionWithStylist(user.id, stylistProfileId);
    if (hasActive) {
      redirect("/sessions");
    }
  }

  const appUrl = resolveAppUrl({
    envAppUrl: process.env.APP_URL,
    headers: await headers(),
  });

  const options = {
    userId: user.id,
    planType,
    stylistId: stylistProfileId,
    stylistUserId,
    successUrl: `${appUrl}/bookings/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${appUrl}/bookings/new${stylistProfileId ? `?stylistId=${stylistProfileId}` : ""}`,
  };

  const session = isSubscription
    ? await createSubscriptionCheckout(options)
    : await createOneTimeCheckout(options);

  if (session.url) {
    redirect(session.url);
  }

  throw new Error("Failed to create checkout session");
}
