"use server";

import { redirect } from "next/navigation";
import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { setE2EAuthCookies, clearE2EAuthCookies } from "@/lib/auth/server-auth";
import { DEMO_CLERK_IDS } from "@/lib/demo/constants";

type DemoRole = "client" | "stylist-maya" | "stylist-alex" | "stylist-jordan";

const DEMO_ROLE_MAP: Record<
  DemoRole,
  { clerkId: string; role: "CLIENT" | "STYLIST"; landing: string }
> = {
  client: {
    clerkId: DEMO_CLERK_IDS.client,
    role: "CLIENT",
    landing: "/sessions",
  },
  "stylist-maya": {
    clerkId: DEMO_CLERK_IDS.stylistMaya,
    role: "STYLIST",
    landing: "/stylist/dashboard",
  },
  "stylist-alex": {
    clerkId: DEMO_CLERK_IDS.stylistAlex,
    role: "STYLIST",
    landing: "/stylist/dashboard",
  },
  "stylist-jordan": {
    clerkId: DEMO_CLERK_IDS.stylistJordan,
    role: "STYLIST",
    landing: "/stylist/dashboard",
  },
};

export async function signInAsDemo(formData: FormData) {
  if (!isE2EAuthModeEnabled()) {
    throw new Error("Demo mode disabled");
  }

  const rawWhich = formData.get("which");
  if (typeof rawWhich !== "string" || !Object.hasOwn(DEMO_ROLE_MAP, rawWhich)) {
    throw new Error("Invalid demo role");
  }

  const { clerkId, role, landing } = DEMO_ROLE_MAP[rawWhich as DemoRole];
  await setE2EAuthCookies({ clerkId, role });
  redirect(landing);
}

export async function signOutDemo() {
  await clearE2EAuthCookies();
  redirect("/demo");
}
