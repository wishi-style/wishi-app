"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { splitName, splitLocation } from "./helpers";

// Persists the text/identity fields edited on /stylist/profile. Image
// fields (avatar, moodboard) and style boards are managed elsewhere and
// not touched here — the editor still keeps those in localStorage for
// now; tracked as a follow-up.
//
// `fullName` is split on the first whitespace into firstName / lastName
// so the existing User shape stays intact. `location` is split on
// "City, State" or "City, Country"; non-comma input drops into city.
// `instagramHandle` arrives normalised (handle only, no @ prefix) — the
// client extracts it via extractInstagramHandle() before posting.

const payloadSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(80),
  philosophy: z.string().trim().min(1).max(500),
  directorsPick: z.string().trim().min(1).max(500),
  bio: z.string().trim().min(1).max(1000),
  instagramHandle: z
    .string()
    .regex(/^[A-Za-z0-9_.]{1,30}$/)
    .nullable(),
});

export type SaveStylistProfilePayload = z.infer<typeof payloadSchema>;

export type SaveStylistProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveStylistProfile(
  payload: unknown,
): Promise<SaveStylistProfileResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.role !== "STYLIST") return { ok: false, error: "Stylist role required" };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { firstName, lastName } = splitName(data.fullName);
  const { city, state } = splitLocation(data.location);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { firstName, lastName },
    });

    await tx.stylistProfile.update({
      where: { userId: user.id },
      data: {
        bio: data.bio,
        philosophy: data.philosophy,
        directorPick: data.directorsPick,
        instagramHandle: data.instagramHandle,
      },
    });

    const existing = await tx.userLocation.findFirst({
      where: { userId: user.id, isPrimary: true },
      select: { id: true },
    });
    if (existing) {
      await tx.userLocation.update({
        where: { id: existing.id },
        data: { city, state },
      });
    } else {
      await tx.userLocation.create({
        data: { userId: user.id, isPrimary: true, city, state },
      });
    }
  });

  return { ok: true };
}
