"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { createOneTimeCheckout, createSubscriptionCheckout } from "@/lib/payments/checkout";
import { hasActiveSessionWithStylist } from "@/lib/sessions/queries";
import type { PlanType } from "@/generated/prisma/client";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function createCheckout(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) throw new Error("User not found");

  const planType = formData.get("planType") as PlanType;
  const stylistId = (formData.get("stylistId") as string) || undefined;
  const isSubscription = formData.get("isSubscription") === "true";

  if (!planType || !["MINI", "MAJOR", "LUX"].includes(planType)) {
    throw new Error("Invalid plan type");
  }

  if (isSubscription && planType === "LUX") {
    throw new Error("Lux plan is one-time only");
  }

  // Active session guard
  if (stylistId) {
    const hasActive = await hasActiveSessionWithStylist(user.id, stylistId);
    if (hasActive) {
      redirect("/sessions");
    }
  }

  const headerList = await headers();
  const origin = headerList.get("origin") || headerList.get("x-forwarded-host") || "http://localhost:3000";
  const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;

  const options = {
    userId: user.id,
    planType,
    stylistId,
    successUrl: `${baseUrl}/bookings/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${baseUrl}/bookings/new${stylistId ? `?stylistId=${stylistId}` : ""}`,
  };

  const session = isSubscription
    ? await createSubscriptionCheckout(options)
    : await createOneTimeCheckout(options);

  if (session.url) {
    redirect(session.url);
  }

  throw new Error("Failed to create checkout session");
}
