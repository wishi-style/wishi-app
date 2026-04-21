// Stylist onboarding wizard — step registry + persistence.
//
// Steps 1–11 write to StylistProfile / User columns directly and bump
// onboardingStep. Step 12 (Stripe Connect) is handled via the Connect
// routes at /api/stylist/onboarding/connect/{start,return}. IN_HOUSE
// stylists skip step 12 — advance() transitions them directly to
// AWAITING_ELIGIBILITY after step 11.
//
// The wizard's current step lives on StylistProfile.onboardingStep. The
// proxy redirect reads onboardingStatus from Clerk publicMetadata to avoid
// a per-request DB round trip; this module syncs the metadata on every
// advance() call.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DomainError } from "@/lib/errors/domain-error";
import type { StylistProfile, User } from "@/generated/prisma/client";

export const TOTAL_STEPS = 12;
export const IN_HOUSE_SKIP_STEP = 12;

export type StepNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// ── Step schemas ───────────────────────────────────────────────────────────

const GenderEnum = z.enum(["MALE", "FEMALE", "NON_BINARY", "PREFER_NOT_TO_SAY"]);

export const stepSchemas = {
  1: z.object({
    genderPreference: z.array(GenderEnum).min(1, "Pick at least one gender"),
  }),
  2: z.object({
    bodySpecialties: z.array(z.string().min(1)).min(1, "Pick at least one body type"),
  }),
  3: z.object({
    styleSpecialties: z.array(z.string().min(1)).min(1, "Pick at least one style"),
    styleExpertiseLevels: z
      .record(z.string(), z.number().int().min(1).max(3))
      .refine((v) => Object.keys(v).length > 0, "Set a level for each style"),
  }),
  4: z.object({
    favoriteBrands: z.array(z.string().min(1)).max(30),
  }),
  5: z.object({
    // Profile-boards step: the wizard creates real Board rows via the builder UI
    // and flips this gate when ≥3 boards per claimed style exist. This schema
    // just records confirmation that the check passed.
    confirmed: z.literal(true),
  }),
  6: z.object({
    phone: z.string().min(7, "Phone number required"),
    city: z.string().min(1),
    country: z.string().min(2).max(3).default("US"),
    state: z.string().optional(),
  }),
  7: z.object({
    philosophy: z.string().min(50, "Write at least 50 characters").max(2000),
  }),
  8: z.object({
    bio: z.string().min(50, "Write at least 50 characters").max(2000),
    yearsExperience: z.number().int().min(0).max(80),
  }),
  9: z.object({
    expertiseByGender: z.record(GenderEnum, z.array(z.string().min(1)).min(1)),
  }),
  10: z.object({
    // Step 10 is a transient success state — no payload, just advance.
  }),
  11: z.object({
    instagramHandle: z
      .string()
      .regex(/^@?[A-Za-z0-9_.]{1,30}$/, "Instagram handle looks invalid")
      .optional()
      .nullable(),
  }),
  12: z.object({
    // Step 12 is the Stripe Connect redirect flow — payload is handled in
    // /api/stylist/onboarding/connect/*. saveStep(12) is a no-op marker.
  }),
} as const satisfies Record<StepNumber, z.ZodTypeAny>;

export type StepPayload<N extends StepNumber> = z.infer<(typeof stepSchemas)[N]>;

// ── Profile resolution ─────────────────────────────────────────────────────

type ProfileWithUser = StylistProfile & { user: Pick<User, "id" | "phone"> };

async function loadProfileByUserId(userId: string): Promise<ProfileWithUser | null> {
  const profile = await prisma.stylistProfile.findUnique({
    where: { userId },
    include: { user: { select: { id: true, phone: true } } },
  });
  return profile ?? null;
}

// ── Step persistence ───────────────────────────────────────────────────────

export async function saveStep<N extends StepNumber>(
  userId: string,
  step: N,
  payload: StepPayload<N>
): Promise<{ onboardingStep: number }> {
  const profile = await loadProfileByUserId(userId);
  if (!profile) throw new Error(`No stylist profile for user ${userId}`);

  switch (step) {
    case 1: {
      const data = payload as StepPayload<1>;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { genderPreference: data.genderPreference },
      });
      break;
    }
    case 2: {
      const data = payload as StepPayload<2>;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { bodySpecialties: data.bodySpecialties },
      });
      break;
    }
    case 3: {
      const data = payload as StepPayload<3>;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: {
          styleSpecialties: data.styleSpecialties,
          styleExpertiseLevels: data.styleExpertiseLevels,
        },
      });
      break;
    }
    case 4: {
      const data = payload as StepPayload<4>;
      await prisma.user.update({
        where: { id: userId },
        data: { favoriteBrands: data.favoriteBrands },
      });
      break;
    }
    case 5: {
      // Profile boards — the user creates them via the builder. We only
      // advance when the required minimum per claimed style is met. Scope
      // the count to profile boards (sessionId = null, isFeaturedOnProfile)
      // so session boards can't spoof the gate.
      const counts = await prisma.board.groupBy({
        by: ["profileStyle"],
        where: {
          stylistProfileId: profile.id,
          sessionId: null,
          isFeaturedOnProfile: true,
          profileStyle: { not: null },
        },
        _count: true,
      });
      const styleCounts = new Map(counts.map((c) => [c.profileStyle ?? "", c._count]));
      const missing = profile.styleSpecialties.filter(
        (style) => (styleCounts.get(style) ?? 0) < 3,
      );
      if (missing.length > 0) {
        throw new DomainError(
          `Need at least 3 featured boards per style. Missing: ${missing.join(", ")}`,
          400,
        );
      }
      break;
    }
    case 6: {
      const data = payload as StepPayload<6>;
      await prisma.user.update({
        where: { id: userId },
        data: { phone: data.phone },
      });
      const existing = await prisma.userLocation.findFirst({
        where: { userId, isPrimary: true },
        select: { id: true },
      });
      if (existing) {
        await prisma.userLocation.update({
          where: { id: existing.id },
          data: { city: data.city, country: data.country, state: data.state ?? null },
        });
      } else {
        await prisma.userLocation.create({
          data: {
            userId,
            isPrimary: true,
            city: data.city,
            country: data.country,
            state: data.state ?? null,
          },
        });
      }
      break;
    }
    case 7: {
      const data = payload as StepPayload<7>;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { philosophy: data.philosophy },
      });
      break;
    }
    case 8: {
      const data = payload as StepPayload<8>;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { bio: data.bio, yearsExperience: data.yearsExperience },
      });
      break;
    }
    case 9: {
      const data = payload as StepPayload<9>;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { expertiseByGender: data.expertiseByGender },
      });
      break;
    }
    case 11: {
      const data = payload as StepPayload<11>;
      await prisma.stylistProfile.update({
        where: { id: profile.id },
        data: { instagramHandle: data.instagramHandle?.replace(/^@/, "") ?? null },
      });
      break;
    }
    case 10:
    case 12:
      // No payload write — step 10 is a transient success state, step 12
      // persistence is handled by the Connect routes.
      break;
  }

  const nextStep = Math.max(profile.onboardingStep, step);
  await prisma.stylistProfile.update({
    where: { id: profile.id },
    data: { onboardingStep: nextStep },
  });
  return { onboardingStep: nextStep };
}

// ── Advance / resume / Clerk metadata sync ─────────────────────────────────

// Advance determines the next step based on stylistType (IN_HOUSE skips step 12)
// and the final transition into AWAITING_ELIGIBILITY.
export async function advance(userId: string): Promise<{
  onboardingStep: number;
  onboardingStatus: string;
}> {
  const profile = await loadProfileByUserId(userId);
  if (!profile) throw new Error(`No stylist profile for user ${userId}`);

  const isInHouse = profile.stylistType === "IN_HOUSE";
  const maxStep = isInHouse ? 11 : 12;

  let nextStep = Math.min(profile.onboardingStep + 1, maxStep);
  let nextStatus = profile.onboardingStatus;

  if (profile.onboardingStep === 0) {
    nextStatus = "IN_PROGRESS";
    nextStep = 1;
  }
  // Base PROFILE_CREATED on the step the user is advancing into so the
  // status flips the moment the wizard reaches the success panel (step 10),
  // instead of lagging until the next advance() call.
  const target = Math.max(profile.onboardingStep, nextStep);
  if (target >= 10) {
    nextStatus = "PROFILE_CREATED";
  }
  // AWAITING_ELIGIBILITY is set when the user saturates past the final step
  // — detected via "nextStep can no longer move" (profile.onboardingStep is
  // already at maxStep). Using profile.onboardingStep here (not nextStep)
  // keeps the PLATFORM flow correct: advancing from step 11 into step 12
  // (Stripe Connect) must NOT flip to AWAITING_ELIGIBILITY because Connect
  // hasn't been completed yet.
  if (profile.onboardingStep >= maxStep) {
    nextStatus = "AWAITING_ELIGIBILITY";
  }

  const updated = await prisma.stylistProfile.update({
    where: { id: profile.id },
    data: {
      onboardingStep: nextStep,
      onboardingStatus: nextStatus as typeof profile.onboardingStatus,
      ...(nextStatus === "AWAITING_ELIGIBILITY"
        ? { onboardingCompletedAt: new Date() }
        : {}),
    },
  });

  await syncOnboardingMetadata(userId, updated.onboardingStatus).catch((err) =>
    console.warn("[onboarding] Clerk metadata sync failed", err)
  );

  return {
    onboardingStep: updated.onboardingStep,
    onboardingStatus: updated.onboardingStatus,
  };
}

// resume() is the read side of the state machine: returns the step the
// wizard should render when the stylist lands on /onboarding.
export async function resume(userId: string): Promise<{
  step: number;
  status: string;
  isInHouse: boolean;
}> {
  const profile = await loadProfileByUserId(userId);
  if (!profile) throw new Error(`No stylist profile for user ${userId}`);
  return {
    step: profile.onboardingStep === 0 ? 1 : profile.onboardingStep,
    status: profile.onboardingStatus,
    isInHouse: profile.stylistType === "IN_HOUSE",
  };
}

// Sync onboarding status to Clerk publicMetadata so the edge proxy can read
// it without a DB call.
async function syncOnboardingMetadata(userId: string, status: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clerkId: true },
  });
  if (!user?.clerkId) return;
  // Avoid a hard Clerk SDK dependency in this module — the import stays
  // lazy so unit tests can run without Clerk env vars.
  const { clerkClient } = await import("@clerk/nextjs/server");
  const client = await clerkClient();
  await client.users.updateUserMetadata(user.clerkId, {
    publicMetadata: { onboardingStatus: status },
  });
}
