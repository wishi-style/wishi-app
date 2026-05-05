"use server";

import { getServerAuth } from "@/lib/auth/server-auth";
import { resolveAppUrl } from "@/lib/app-url";
import { runCheckout } from "@/lib/payments/run-checkout";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Thin wrapper. All branching logic lives in `runCheckout` so it can be
// unit-tested directly. See `src/lib/payments/run-checkout.ts` for the e2e
// vs Stripe gating rule.
export async function createCheckout(formData: FormData) {
  const auth = await getServerAuth();
  const appUrl = resolveAppUrl({
    envAppUrl: process.env.APP_URL,
    headers: await headers(),
  });

  const outcome = await runCheckout({ auth, formData, appUrl });

  switch (outcome.kind) {
    case "redirect-to-active-session":
    case "e2e-provisioned":
      redirect("/sessions");
    case "redirect-to-stripe":
      redirect(outcome.url);
  }
}
