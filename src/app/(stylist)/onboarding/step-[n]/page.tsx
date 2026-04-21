import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";
import { TOTAL_STEPS } from "@/lib/stylists/onboarding";
import { StepOne } from "./step-one";
import { StepTwo } from "./step-two";
import { StepThree } from "./step-three";
import { StepFour } from "./step-four";
import { StepFive } from "./step-five";
import { StepSix } from "./step-six";
import { StepSeven } from "./step-seven";
import { StepEight } from "./step-eight";
import { StepNine } from "./step-nine";
import { StepTen } from "./step-ten";
import { StepEleven } from "./step-eleven";
import { StepTwelve } from "./step-twelve";

export const dynamic = "force-dynamic";

export default async function OnboardingStepPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { n } = await params;
  const stepNum = Number(n);
  if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > TOTAL_STEPS) notFound();

  await requireRole("STYLIST");
  const user = await getCurrentAuthUser();
  if (!user) redirect("/sign-in");

  const profile = await prisma.stylistProfile.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      stylistType: true,
      onboardingStep: true,
      genderPreference: true,
      bodySpecialties: true,
      styleSpecialties: true,
      styleExpertiseLevels: true,
      philosophy: true,
      bio: true,
      yearsExperience: true,
      expertiseByGender: true,
      instagramHandle: true,
      stripeConnectId: true,
      payoutsEnabled: true,
      user: { select: { favoriteBrands: true } },
    },
  });
  if (!profile) notFound();

  // Block navigating past an unfinished earlier step. If the user has only
  // reached step N via the wizard, jumping to step N+2 by URL could skip
  // required persistence/validation. Send them back to their current step
  // (the proxy gate handles the "outside the wizard entirely" case; this is
  // defense-in-depth for direct step URLs).
  const currentStep = Math.max(1, profile.onboardingStep || 1);
  if (stepNum > currentStep) {
    redirect(`/onboarding/step-${currentStep}`);
  }

  const sp = (await searchParams) ?? {};
  const statusParam = typeof sp.status === "string" ? sp.status : null;

  switch (stepNum) {
    case 1:
      return <StepOne initial={{ genderPreference: profile.genderPreference }} />;
    case 2:
      return <StepTwo initial={{ bodySpecialties: profile.bodySpecialties }} />;
    case 3:
      return (
        <StepThree
          initial={{
            styleSpecialties: profile.styleSpecialties,
            styleExpertiseLevels:
              (profile.styleExpertiseLevels as Record<string, number>) ?? {},
          }}
        />
      );
    case 4:
      return <StepFour initial={{ favoriteBrands: profile.user?.favoriteBrands ?? [] }} />;
    case 5:
      return <StepFive stylistProfileId={profile.id} styleSpecialties={profile.styleSpecialties} />;
    case 6:
      return <StepSix />;
    case 7:
      return <StepSeven initial={{ philosophy: profile.philosophy ?? "" }} />;
    case 8:
      return (
        <StepEight
          initial={{ bio: profile.bio ?? "", yearsExperience: profile.yearsExperience ?? 0 }}
        />
      );
    case 9:
      return (
        <StepNine
          initial={{
            expertiseByGender:
              (profile.expertiseByGender as Record<string, string[]>) ?? {},
          }}
        />
      );
    case 10:
      return <StepTen />;
    case 11:
      return <StepEleven initial={{ instagramHandle: profile.instagramHandle ?? "" }} />;
    case 12:
      if (profile.stylistType === "IN_HOUSE") {
        // In-house stylists shouldn't see step 12 at all.
        redirect("/stylist/dashboard");
      }
      return (
        <StepTwelve
          connected={Boolean(profile.stripeConnectId && profile.payoutsEnabled)}
          status={statusParam}
        />
      );
    default:
      notFound();
  }
}
