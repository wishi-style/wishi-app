import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getActivePlans } from "@/lib/plans";
import { SiteHeader } from "@/components/primitives/site-header";
import { SiteFooter } from "@/components/primitives/site-footer";
import { SelectPlanClient } from "./select-plan-client";

export const metadata: Metadata = {
  title: "Choose your plan — Wishi",
  description: "Pick the styling plan that fits how you want to be styled.",
};

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ stylistId?: string }>;
}

export default async function SelectPlanPage({ searchParams }: Props) {
  const params = await searchParams;
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/match-quiz");
  }

  const plans = await getActivePlans();

  let stylistName: string | null = null;
  let stylistAvatarUrl: string | null = null;
  if (params.stylistId) {
    const profile = await prisma.stylistProfile.findUnique({
      where: { id: params.stylistId },
      select: {
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    if (profile) {
      stylistName = profile.user.firstName;
      stylistAvatarUrl = profile.user.avatarUrl;
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <SelectPlanClient
        plans={plans}
        stylistId={params.stylistId ?? null}
        stylistName={stylistName}
        stylistAvatarUrl={stylistAvatarUrl}
      />
      <SiteFooter />
    </div>
  );
}
